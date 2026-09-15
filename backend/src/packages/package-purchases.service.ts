import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { StripeService } from '../billing/stripe.service';
import { PageResult, toSkipTake } from '../common/dto/pagination.dto';
import { PageQueryDto } from '../common/dto/pagination.dto';
import { GrantPackageDto } from './dto/grant-package.dto';
import { RbacService } from '../rbac/rbac.service';
import type { Role } from '../rbac/rbac.constants';

interface ActingUser {
  id: string;
  role: Role;
}

/**
 * The discriminator carried on every pacote Checkout session.
 *
 * A one-off pacote purchase fires `checkout.session.completed`, the exact
 * event the subscription flow already owns. BillingService branches on
 * this plus `session.mode` and refuses to guess when either is missing —
 * a payment mistaken for a subscription would write
 * stripeSubscriptionId onto a reader who has no subscription.
 */
export const PACKAGE_CHECKOUT_KIND = 'pacote';

/** A PENDENTE row younger than this is reused instead of making another. */
const PENDING_REUSE_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class PackagePurchasesService {
  private readonly logger = new Logger(PackagePurchasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
    private readonly activity: ActivityLogService,
    private readonly rbac: RbacService,
  ) {}

  private siteUrl(): string {
    return (
      this.config.get<string>('PUBLIC_SITE_URL') ?? 'http://localhost:3005'
    );
  }

  // ── checkout ───────────────────────────────────────────────────────

  /**
   * Start a one-off Stripe Checkout for a pacote.
   *
   * The purchase row is written FIRST, as PENDENTE, carrying the frozen
   * article list. Two reasons, and both matter:
   *
   *   1. The snapshot has to be taken from what the reader was looking at
   *      when they clicked buy. Between here and the webhook an editor can
   *      remove an article — usually seconds later, occasionally hours
   *      (a delayed payment method, a Stripe outage, a retried webhook).
   *      Snapshotting on arrival would hand the buyer less than the page
   *      they paid from listed.
   *   2. It makes the webhook a primary-key lookup instead of a
   *      reconstruction.
   *
   * Nothing about the amount comes from the caller. They send a slug.
   */
  async createCheckoutSession(
    reader: { id: string; email: string },
    slug: string,
  ): Promise<{ url: string }> {
    const pkg = await this.prisma.package.findFirst({
      where: { slug, status: 'PUBLICADO' },
      select: {
        id: true,
        name: true,
        slug: true,
        priceCents: true,
        currency: true,
        stripePriceId: true,
        items: {
          orderBy: { position: 'asc' },
          where: { article: { status: 'PUBLICADO' } },
          select: { articleId: true },
        },
      },
    });
    if (!pkg) throw new NotFoundException('Pacote não encontrado.');

    const owned = await this.prisma.packagePurchase.findFirst({
      where: { readerId: reader.id, packageId: pkg.id, status: 'PAGO' },
      select: { id: true },
    });
    if (owned) {
      throw new ConflictException('Já tem este pacote.');
    }

    if (!this.stripe.enabled || !pkg.stripePriceId) {
      throw new ServiceUnavailableException(
        'Este pacote ainda não está disponível para compra.',
      );
    }

    const row = await this.prisma.reader.findUnique({
      where: { id: reader.id },
      select: { id: true, email: true, stripeCustomerId: true },
    });
    if (!row) throw new NotFoundException('Leitor não encontrado.');

    const articleIds = pkg.items.map((i) => i.articleId);
    if (articleIds.length === 0) {
      throw new ServiceUnavailableException(
        'Este pacote não tem artigos disponíveis.',
      );
    }

    // Reuse a recent unfinished attempt rather than minting another. Stops
    // a double-click, and a bored reader hammering the button, from
    // leaving a pile of Stripe objects and orphan rows behind.
    const reusable = await this.prisma.packagePurchase.findFirst({
      where: {
        readerId: row.id,
        packageId: pkg.id,
        status: 'PENDENTE',
        createdAt: { gte: new Date(Date.now() - PENDING_REUSE_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const purchase = reusable
      ? await this.prisma.packagePurchase.update({
          where: { id: reusable.id },
          // The snapshot is refreshed on reuse: this IS a new click on a
          // new render of the page, so the offer is what is on screen now.
          data: {
            snapshotArticleIds: articleIds,
            amountCents: pkg.priceCents,
            currency: pkg.currency,
          },
          select: { id: true },
        })
      : await this.prisma.packagePurchase.create({
          data: {
            readerId: row.id,
            packageId: pkg.id,
            status: 'PENDENTE',
            source: 'STRIPE',
            snapshotArticleIds: articleIds,
            amountCents: pkg.priceCents,
            currency: pkg.currency,
          },
          select: { id: true },
        });

    const metadata = {
      kind: PACKAGE_CHECKOUT_KIND,
      readerId: row.id,
      packageId: pkg.id,
      purchaseId: purchase.id,
    };

    const session = await this.stripe.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: pkg.stripePriceId, quantity: 1 }],
      ...(row.stripeCustomerId
        ? { customer: row.stripeCustomerId }
        : { customer_email: row.email }),
      client_reference_id: row.id,
      metadata,
      // Repeated onto the PaymentIntent because charge.refunded and
      // charge.dispute.created carry no session — the same reason
      // subscription_data.metadata exists on the subscription path.
      payment_intent_data: { metadata },
      allow_promotion_codes: true,
      // A receipt has to exist, and a Portuguese buyer has to be able to
      // put a NIF on it. automatic_tax stays OFF: turning it on without
      // Tax configured on the account makes checkout fail outright, and
      // the stored price is documented as IVA incluído.
      invoice_creation: { enabled: true },
      tax_id_collection: { enabled: true },
      locale: 'pt',
      success_url: `${this.siteUrl()}/conta/pacotes?sucesso=1&pacote=${pkg.slug}`,
      cancel_url: `${this.siteUrl()}/pacotes/${pkg.slug}`,
    });

    if (!session.url) {
      throw new ServiceUnavailableException(
        'O Stripe não devolveu um endereço de pagamento.',
      );
    }
    await this.prisma.packagePurchase.update({
      where: { id: purchase.id },
      data: { stripeCheckoutSessionId: session.id },
    });
    return { url: session.url };
  }

  // ── webhook ────────────────────────────────────────────────────────

  /**
   * A pacote payment landed.
   *
   * Called from BillingService.handleEvent, which owns the signature check
   * and the StripeEvent idempotency ledger. Everything that grants access
   * happens in ONE transaction with the event id, exactly like the
   * subscription path: a duplicate delivery hits the primary key on
   * StripeEvent, the transaction aborts, and nothing is granted twice.
   */
  async onCheckoutCompleted(
    event: Stripe.Event,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const readerId =
      session.metadata?.readerId ?? session.client_reference_id ?? null;
    const purchaseId = session.metadata?.purchaseId ?? null;

    // 'unpaid' is a delayed method (Multibanco and friends) that has not
    // settled. Granting here would be giving the product away on the
    // promise of a payment that may never arrive;
    // checkout.session.async_payment_succeeded arrives when it does.
    if (session.payment_status === 'unpaid') {
      this.logger.log(
        `Sessão ${session.id} ainda não paga (${session.payment_status}) — nada concedido.`,
      );
      await this.record(event, readerId);
      return;
    }

    const purchase = purchaseId
      ? await this.prisma.packagePurchase.findUnique({
          where: { id: purchaseId },
        })
      : await this.prisma.packagePurchase.findUnique({
          where: { stripeCheckoutSessionId: session.id },
        });

    // No row means the snapshot is gone, and it must NOT be rebuilt from
    // today's membership: the buyer would silently get whatever the pacote
    // happens to contain now instead of what they paid for. Loud, recorded,
    // and still a 200 — a 500 here just makes Stripe retry for three days.
    if (!purchase) {
      this.logger.error(
        `Sessão ${session.id} paga mas sem linha de compra ` +
          `(purchaseId=${purchaseId ?? 'ausente'}, reader=${readerId ?? 'ausente'}). ` +
          'Resolver à mão — não é possível reconstruir o snapshot.',
      );
      await this.record(event, readerId);
      return;
    }

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer?.id ?? null);
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    await this.prisma.$transaction(async (tx) => {
      await tx.stripeEvent.create({
        data: {
          id: event.id,
          type: event.type,
          readerId: purchase.readerId,
        },
      });

      // Filtered on PENDENTE, so a hand-replayed event — somebody hitting
      // "resend" in the Stripe dashboard after the ledger row was pruned —
      // still cannot promote a purchase twice.
      const promoted = await tx.packagePurchase.updateMany({
        where: { id: purchase.id, status: 'PENDENTE' },
        data: {
          status: 'PAGO',
          paidAt: new Date(),
          amountCents: session.amount_total ?? purchase.amountCents,
          currency: (session.currency ?? purchase.currency).toUpperCase(),
          ...(paymentIntentId
            ? { stripePaymentIntentId: paymentIntentId }
            : {}),
        },
      });

      if (promoted.count === 1) {
        // The snapshot becomes the entitlement. skipDuplicates so a
        // partial replay is a no-op rather than a crash inside the
        // transaction.
        await tx.packagePurchaseItem.createMany({
          data: purchase.snapshotArticleIds.map((articleId) => ({
            purchaseId: purchase.id,
            articleId,
            readerId: purchase.readerId,
          })),
          skipDuplicates: true,
        });
      }

      if (customerId) {
        // updateMany, and only while the column is still empty:
        // stripeCustomerId is @unique, and a P2002 thrown in here would
        // abort the transaction, leave the event unrecorded, and have
        // Stripe retry it for three days.
        //
        // ONLY this column. plan, planStatus, planRenewsAt, planSource and
        // stripeSubscriptionId all mean "subscription entitled until", and
        // a one-off purchase has nothing to say about any of them.
        await tx.reader.updateMany({
          where: { id: purchase.readerId, stripeCustomerId: null },
          data: { stripeCustomerId: customerId },
        });
      }
    });

    this.logger.log(
      `Leitor ${purchase.readerId} comprou o pacote ${purchase.packageId} ` +
        `(compra ${purchase.id}, ${purchase.snapshotArticleIds.length} artigos).`,
    );
  }

  /**
   * The reader walked away and Stripe closed the session.
   *
   * Housekeeping only: it marks the abandoned attempt so the purchases
   * list does not fill up with rows that look like they are still in
   * flight. Nothing was ever granted, so nothing is taken back.
   */
  async onCheckoutExpired(
    event: Stripe.Event,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const purchaseId = session.metadata?.purchaseId ?? null;
    await this.prisma.packagePurchase.updateMany({
      where: {
        ...(purchaseId
          ? { id: purchaseId }
          : { stripeCheckoutSessionId: session.id }),
        status: 'PENDENTE',
      },
      data: { status: 'EXPIRADO' },
    });
    await this.record(event, session.metadata?.readerId ?? null);
  }

  /**
   * Finds the pacote purchase a charge-level event belongs to.
   *
   * charge.refunded and charge.dispute.* carry no Checkout session, which
   * is why createCheckoutSession copies the metadata onto the PaymentIntent
   * as well. stripePaymentIntentId is the fallback for a charge whose
   * metadata was lost.
   */
  private async findPurchaseForCharge(charge: {
    metadata?: Stripe.Metadata | null;
    payment_intent?: string | Stripe.PaymentIntent | null;
  }) {
    const purchaseId =
      (charge.metadata?.purchaseId as string | undefined) ?? null;
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : (charge.payment_intent?.id ?? null);

    return this.prisma.packagePurchase.findFirst({
      where: purchaseId
        ? { id: purchaseId }
        : paymentIntentId
          ? { stripePaymentIntentId: paymentIntentId }
          : { id: '__nenhum__' },
      select: { id: true, readerId: true, packageId: true, status: true },
    });
  }

  /**
   * A payment came back.
   *
   * A TOTAL refund revokes: entitlement must not outlive the payment that
   * bought it, and hasPurchased() answers the paywall from the bare
   * existence of the item rows, so leaving them is leaving the content
   * paid-for-then-unpaid. A PARTIAL refund only marks the row and keeps
   * access — that is the case the original "a person decides" deferral was
   * really about, and taking access away on a €2 goodwill refund of a €15
   * pacote is the angry-support-ticket failure mode it was avoiding.
   *
   * Either way the reversal is PERSISTED. It used to be logged and nothing
   * else: the row stayed PAGO with revokedAt null, so the admin purchases
   * table showed a refunded purchase as an ordinary green paid row and the
   * operator had no way to know a decision was due. Worse, README told the
   * operator to subscribe four event types that did not include
   * charge.refunded, so even the log line never fired.
   */
  async onChargeRefunded(
    event: Stripe.Event,
    charge: Stripe.Charge,
  ): Promise<void> {
    const purchase = await this.findPurchaseForCharge(charge);

    if (!purchase) {
      this.logger.warn(
        `charge.refunded ${charge.id} sem compra de pacote correspondente.`,
      );
      await this.record(event, null);
      return;
    }

    const refunded = charge.amount_refunded ?? 0;
    const total =
      typeof charge.amount === 'number' && refunded >= charge.amount;
    // Only a PAGO purchase has entitlement rows to take back. A row that
    // is already REEMBOLSADO or EXPIRADO is marked and left alone.
    const revoking = total && purchase.status === 'PAGO';

    await this.prisma.$transaction(async (tx) => {
      await tx.stripeEvent.create({
        data: { id: event.id, type: event.type, readerId: purchase.readerId },
      });
      await tx.packagePurchase.updateMany({
        where: { id: purchase.id },
        data: {
          refundedAt: new Date(),
          refundedAmountCents: refunded,
          ...(revoking
            ? { status: 'REEMBOLSADO' as const, revokedAt: new Date() }
            : {}),
        },
      });
      if (revoking) {
        await tx.packagePurchaseItem.deleteMany({
          where: { purchaseId: purchase.id },
        });
      }
    });

    this.logger.error(
      `REEMBOLSO no Stripe para a compra ${purchase.id} ` +
        `(leitor ${purchase.readerId}, pacote ${purchase.packageId}, ` +
        `${refunded} de ${charge.amount ?? '?'} cêntimos). ` +
        (revoking
          ? 'Reembolso total — acesso retirado automaticamente.'
          : 'Reembolso parcial — marcado, acesso mantido. Rever no admin.'),
    );
  }

  /**
   * A chargeback: the buyer disputed the payment with their card issuer.
   *
   * This reached no `case` in the event switch at all, so it fell to the
   * default record-and-ignore branch without so much as a log line — a
   * buyer could take the money back unilaterally and keep reading, with
   * nothing anywhere in the product saying so.
   *
   * Opening a dispute marks the row and logs loudly but does not revoke:
   * a dispute can be won, and taking access from a reader who then turns
   * out to be right is worse than the delay. A dispute LOST is a final
   * reversal, and revokes on the same terms as a total refund.
   */
  async onChargeDisputed(
    event: Stripe.Event,
    dispute: Stripe.Dispute,
  ): Promise<void> {
    const purchase = await this.findPurchaseForCharge({
      metadata: dispute.metadata,
      payment_intent: dispute.payment_intent,
    });

    if (!purchase) {
      this.logger.warn(
        `${event.type} ${dispute.id} sem compra de pacote correspondente.`,
      );
      await this.record(event, null);
      return;
    }

    const lost = dispute.status === 'lost';
    const revoking = lost && purchase.status === 'PAGO';

    await this.prisma.$transaction(async (tx) => {
      await tx.stripeEvent.create({
        data: { id: event.id, type: event.type, readerId: purchase.readerId },
      });
      await tx.packagePurchase.updateMany({
        where: { id: purchase.id },
        data: {
          disputedAt: new Date(),
          ...(revoking
            ? { status: 'REEMBOLSADO' as const, revokedAt: new Date() }
            : {}),
        },
      });
      if (revoking) {
        await tx.packagePurchaseItem.deleteMany({
          where: { purchaseId: purchase.id },
        });
      }
    });

    this.logger.error(
      `DISPUTA no Stripe (${dispute.status}) para a compra ${purchase.id} ` +
        `(leitor ${purchase.readerId}, pacote ${purchase.packageId}). ` +
        (revoking
          ? 'Disputa perdida — acesso retirado automaticamente.'
          : 'Marcada, acesso mantido. Rever no admin.'),
    );
  }

  private async record(event: Stripe.Event, readerId: string | null) {
    await this.prisma.stripeEvent.create({
      data: { id: event.id, type: event.type, readerId },
    });
  }

  // ── reader reads ───────────────────────────────────────────────────

  /**
   * "Os meus pacotes".
   *
   * Lists the SNAPSHOT, not the pacote's current contents, and flags any
   * article that has since left it. That is decision (2) made visible: the
   * reader can see they still have what they paid for.
   *
   * Nothing Stripe-shaped is serialised — no session id, no payment intent,
   * not even the purchase id is needed by the page.
   */
  async listForReader(readerId: string) {
    const purchases = await this.prisma.packagePurchase.findMany({
      where: { readerId, status: 'PAGO' },
      orderBy: { paidAt: 'desc' },
      select: {
        packageId: true,
        amountCents: true,
        currency: true,
        source: true,
        paidAt: true,
        snapshotArticleIds: true,
        package: {
          select: {
            slug: true,
            name: true,
            coverImageUrl: true,
            items: { select: { articleId: true } },
          },
        },
      },
    });
    if (purchases.length === 0) return [];

    const allIds = [...new Set(purchases.flatMap((p) => p.snapshotArticleIds))];
    const articles = await this.prisma.article.findMany({
      where: { id: { in: allIds } },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        coverImageUrl: true,
        publishedAt: true,
        category: { select: { name: true } },
      },
    });
    const byId = new Map(articles.map((a) => [a.id, a]));

    return purchases.map((p) => {
      const stillIn = new Set(p.package.items.map((i) => i.articleId));
      return {
        packageSlug: p.package.slug,
        packageName: p.package.name,
        coverImageUrl: p.package.coverImageUrl,
        amountCents: p.amountCents,
        currency: p.currency,
        source: p.source,
        paidAt: p.paidAt,
        articles: p.snapshotArticleIds
          .map((id) => {
            const a = byId.get(id);
            if (!a) return null;
            return {
              slug: a.slug,
              title: a.title,
              coverImageUrl: a.coverImageUrl,
              publishedAt: a.publishedAt,
              categoryName: a.category.name,
              /** Bought and paid for, but no longer part of the pacote. */
              removedFromPackage: !stillIn.has(a.id),
            };
          })
          .filter((a) => a !== null),
      };
    });
  }

  // ── admin ──────────────────────────────────────────────────────────

  async listPurchases(
    query: PageQueryDto,
    user: ActingUser,
  ): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);

    // Reader identity has ONE control in this system: leitores.ver, which
    // gates GET /admin/readers and whose curated READER_VIEW select decides
    // which reader columns may reach an admin screen at all.
    //
    // This route is gated on pacotes.ver_compras — "quem comprou que pacote
    // e por quanto" — which ANALISTA holds by default precisely because
    // revenue per pacote is a number and numbers are their job. ANALISTA is
    // deliberately NOT given leitores.ver, so returning the buyer's name and
    // address here made this the one reader-identity surface that role could
    // reach, and the RBAC screen presents the two permissions as independent
    // switches while one silently implied the other.
    const perms =
      user.role === 'SUPER_ADMIN'
        ? null // null means "everything"
        : await this.rbac.getPermissionsForRole(user.role);
    const maySeeReaders = perms === null || perms.includes('leitores.ver');

    const [items, total] = await Promise.all([
      this.prisma.packagePurchase.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          status: true,
          source: true,
          amountCents: true,
          currency: true,
          createdAt: true,
          paidAt: true,
          revokedAt: true,
          refundedAt: true,
          refundedAmountCents: true,
          disputedAt: true,
          grantNote: true,
          reader: {
            select: maySeeReaders
              ? { id: true, email: true, name: true }
              : { id: true },
          },
          package: { select: { id: true, name: true, slug: true } },
          grantedBy: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.packagePurchase.count(),
    ]);
    return {
      items,
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  /**
   * Comp a pacote: access with no payment.
   *
   * A real feature — the pacote equivalent of oferecer_assinatura — that
   * happens to be the whole entitlement path exercisable on a deployment
   * with no Stripe keys.
   *
   * The snapshot is the pacote's contents right now, which is the same
   * rule a paying buyer gets.
   */
  async grant(dto: GrantPackageDto, user: ActingUser) {
    const [reader, pkg] = await Promise.all([
      this.prisma.reader.findUnique({
        where: { id: dto.readerId },
        select: { id: true, email: true },
      }),
      this.prisma.package.findUnique({
        where: { id: dto.packageId },
        select: {
          id: true,
          name: true,
          currency: true,
          items: {
            orderBy: { position: 'asc' },
            select: { articleId: true },
          },
        },
      }),
    ]);
    if (!reader) throw new NotFoundException('Leitor não encontrado.');
    if (!pkg) throw new NotFoundException('Pacote não encontrado.');

    const owned = await this.prisma.packagePurchase.findFirst({
      where: { readerId: reader.id, packageId: pkg.id, status: 'PAGO' },
      select: { id: true },
    });
    if (owned) {
      throw new ConflictException('Este leitor já tem este pacote.');
    }

    const articleIds = pkg.items.map((i) => i.articleId);
    const purchase = await this.prisma.$transaction(async (tx) => {
      const created = await tx.packagePurchase.create({
        data: {
          readerId: reader.id,
          packageId: pkg.id,
          status: 'PAGO',
          source: 'MANUAL',
          snapshotArticleIds: articleIds,
          // Zero, because nothing was charged. The receipt has to agree
          // with the bank statement, and there is no bank statement.
          amountCents: 0,
          currency: pkg.currency,
          paidAt: new Date(),
          grantedById: user.id,
          grantNote: dto.note?.trim() || null,
        },
        select: { id: true },
      });
      if (articleIds.length > 0) {
        await tx.packagePurchaseItem.createMany({
          data: articleIds.map((articleId) => ({
            purchaseId: created.id,
            articleId,
            readerId: reader.id,
          })),
          skipDuplicates: true,
        });
      }
      return created;
    });

    void this.activity.record({
      userId: user.id,
      action: 'package_granted',
      targetType: 'reader',
      targetId: reader.id,
      targetLabel: `${pkg.name} → ${reader.email}`,
    });
    this.logger.log(
      `Pacote ${pkg.id} oferecido a ${reader.id} por ${user.id} ` +
        `(compra ${purchase.id}, ${articleIds.length} artigos).`,
    );
    return { ok: true, purchaseId: purchase.id };
  }

  /**
   * Take the access back, after a refund somebody decided on.
   *
   * Deleting the items is the revocation — see PackagePurchaseItem for why
   * it is a DELETE and not a flag. The purchase row stays, with its
   * snapshot and a revokedAt, so what happened is still on the record.
   */
  async revoke(purchaseId: string, user: ActingUser) {
    const purchase = await this.prisma.packagePurchase.findUnique({
      where: { id: purchaseId },
      select: {
        id: true,
        status: true,
        readerId: true,
        reader: { select: { email: true } },
        package: { select: { name: true } },
      },
    });
    if (!purchase) throw new NotFoundException('Compra não encontrada.');
    if (purchase.status !== 'PAGO') {
      throw new BadRequestException(
        'Só é possível revogar uma compra paga.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.packagePurchaseItem.deleteMany({ where: { purchaseId } }),
      this.prisma.packagePurchase.update({
        where: { id: purchaseId },
        data: { status: 'REEMBOLSADO', revokedAt: new Date() },
      }),
    ]);

    void this.activity.record({
      userId: user.id,
      action: 'package_revoked',
      targetType: 'reader',
      targetId: purchase.readerId,
      targetLabel: `${purchase.package.name} → ${purchase.reader.email}`,
    });
    this.logger.log(
      `Compra ${purchaseId} revogada por ${user.id}: acesso retirado.`,
    );
    return { ok: true };
  }
}
