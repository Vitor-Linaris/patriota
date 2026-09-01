import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { lapsedPlanData } from '../reader-auth/reader-entitlement';

/**
 * Stripe subscription statuses that entitle a reader to read.
 *
 * `active` and `trialing` only. Note what is NOT here: `past_due`, which
 * means a payment failed and Stripe is retrying. Stripe keeps the
 * subscription alive during that window on purpose, and so do we — see
 * planFor() below, which lets `current_period_end` decide rather than
 * cutting a paying customer off over one bounced card.
 */
const ENTITLING = new Set<Stripe.Subscription.Status>(['active', 'trialing']);

/** Statuses that mean the subscription is over and not coming back. */
const DEAD = new Set<Stripe.Subscription.Status>([
  'canceled',
  'incomplete_expired',
  'unpaid',
]);

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  private siteUrl(): string {
    return (
      this.config.get<string>('PUBLIC_SITE_URL') ?? 'http://localhost:3005'
    );
  }

  // ─────────────────────────────── checkout ───────────────────────────

  /**
   * Starts a Stripe Checkout session for a reader.
   *
   * Reuses the reader's Stripe customer if they have one. That is what
   * makes resubscribing update the same account instead of creating a
   * second one — the promise already written on /p/assinatura — and it
   * keeps one invoice history per person rather than one per attempt.
   */
  async createCheckoutSession(reader: {
    id: string;
    email: string;
  }): Promise<{ url: string }> {
    const price = this.stripe.priceId;
    if (!price) {
      throw new ServiceUnavailableException(
        'Não há plano de assinatura configurado neste servidor.',
      );
    }

    const row = await this.prisma.reader.findUnique({
      where: { id: reader.id },
      select: {
        id: true,
        email: true,
        plan: true,
        planRenewsAt: true,
        planSource: true,
        stripeCustomerId: true,
      },
    });
    if (!row) throw new NotFoundException('Leitor não encontrado.');

    // Refused rather than allowed to go through and be sorted out later:
    // a second checkout would take a second card and start a second
    // subscription, and the reader would be paying twice for one thing.
    if (row.planSource === 'STRIPE' && row.plan !== 'GRATIS') {
      throw new BadRequestException(
        'Já tem uma assinatura activa. Faça a gestão no portal de faturação.',
      );
    }

    const session = await this.stripe.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      // Both are set from OUR record, never from anything the browser
      // sent: this is the link between a Stripe customer and a reader,
      // and the webhook trusts it.
      ...(row.stripeCustomerId
        ? { customer: row.stripeCustomerId }
        : { customer_email: row.email }),
      client_reference_id: row.id,
      // Repeated on the subscription so `customer.subscription.*` events,
      // which carry no session, can still find the reader.
      subscription_data: { metadata: { readerId: row.id } },
      metadata: { readerId: row.id },
      allow_promotion_codes: true,
      success_url: `${this.siteUrl()}/conta/assinatura?sucesso=1`,
      cancel_url: `${this.siteUrl()}/p/assinatura`,
    });

    if (!session.url) {
      throw new ServiceUnavailableException(
        'O Stripe não devolveu um endereço de pagamento.',
      );
    }
    return { url: session.url };
  }

  /**
   * The Stripe billing portal: cancel, change card, download invoices.
   *
   * Everything to do with a card happens on Stripe's own pages. We never
   * see a card number, which is the entire reason to send them there
   * rather than building any of it.
   */
  async createPortalSession(readerId: string): Promise<{ url: string }> {
    const row = await this.prisma.reader.findUnique({
      where: { id: readerId },
      select: { stripeCustomerId: true },
    });
    if (!row?.stripeCustomerId) {
      throw new BadRequestException(
        'Esta conta não tem faturação associada.',
      );
    }

    const session = await this.stripe.stripe.billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: `${this.siteUrl()}/conta/assinatura`,
    });
    return { url: session.url };
  }

  // ─────────────────────────────── webhooks ───────────────────────────

  /**
   * Acts on a Stripe event, exactly once.
   *
   * The id is written to StripeEvent inside the SAME transaction as the
   * change it authorises. Stripe delivers at least once and retries
   * until it gets a 2xx, so the same event arriving twice is routine,
   * not an anomaly — and a duplicate that extended a subscription twice
   * would be invisible until somebody read their invoices.
   *
   * Returns `false` when the event had already been handled, so the
   * controller can still answer 200: a retry that gets an error would be
   * retried again, for ever.
   */
  async handleEvent(event: Stripe.Event): Promise<boolean> {
    const seen = await this.prisma.stripeEvent.findUnique({
      where: { id: event.id },
      select: { id: true },
    });
    if (seen) {
      this.logger.log(`Event ${event.id} (${event.type}) already handled.`);
      return false;
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(
          event,
          event.data.object as Stripe.Checkout.Session,
        );
        return true;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.onSubscriptionChanged(
          event,
          event.data.object as Stripe.Subscription,
        );
        return true;

      default:
        // Recorded anyway. Stripe sends far more event types than we
        // subscribe to, and writing the id down means a later retry of
        // something we ignore does not walk the switch again.
        await this.record(event, null);
        return true;
    }
  }

  private async record(event: Stripe.Event, readerId: string | null) {
    await this.prisma.stripeEvent.create({
      data: { id: event.id, type: event.type, readerId },
    });
  }

  /**
   * The moment a reader becomes a customer.
   *
   * The only job here is to attach the Stripe ids to the right reader —
   * the plan itself is set by the `customer.subscription.*` event that
   * accompanies it, which carries the period end and the status. Two
   * events, one source of truth each.
   */
  private async onCheckoutCompleted(
    event: Stripe.Event,
    session: Stripe.Checkout.Session,
  ) {
    const readerId =
      session.client_reference_id ?? session.metadata?.readerId ?? null;
    if (!readerId) {
      this.logger.warn(
        `checkout.session.completed ${session.id} carries no readerId.`,
      );
      await this.record(event, null);
      return;
    }

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer?.id ?? null);
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription?.id ?? null);

    await this.prisma.$transaction(async (tx) => {
      await tx.stripeEvent.create({
        data: { id: event.id, type: event.type, readerId },
      });
      await tx.reader.update({
        where: { id: readerId },
        data: {
          ...(customerId ? { stripeCustomerId: customerId } : {}),
          ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        },
      });
    });
    this.logger.log(`Reader ${readerId} linked to customer ${customerId}.`);
  }

  /**
   * What the plan should be, given a Stripe subscription.
   *
   * `current_period_end` becomes planRenewsAt, which is what gives RF6
   * for free: cancelling in Stripe sets `cancel_at_period_end` and
   * leaves the status `active`, so the reader keeps reading until the
   * date they already paid for, and then the date passes and they stop.
   * Nothing has to run for that to happen.
   *
   * A `past_due` subscription keeps its entitlement to the period end
   * too. Stripe is still retrying the card at that point; cutting
   * somebody off over one bounced payment, on the day it bounces, is how
   * a paying subscriber becomes an angry ex-subscriber.
   */
  private planFor(sub: Stripe.Subscription) {
    const periodEnd = subscriptionPeriodEnd(sub);

    if (DEAD.has(sub.status)) return { ...lapsedPlanData(), planStatus: sub.status };

    const entitled =
      ENTITLING.has(sub.status) ||
      (sub.status === 'past_due' &&
        periodEnd !== null &&
        periodEnd.getTime() > Date.now());

    if (!entitled) return { ...lapsedPlanData(), planStatus: sub.status };

    return {
      plan: 'PREMIUM' as const,
      planStatus: sub.status,
      planRenewsAt: periodEnd,
      planSource: 'STRIPE' as const,
      // A paid subscription is nobody's gift.
      planGrantedById: null,
      planNote: null,
    };
  }

  private async onSubscriptionChanged(
    event: Stripe.Event,
    sub: Stripe.Subscription,
  ) {
    const reader = await this.findReaderFor(sub);
    if (!reader) {
      this.logger.warn(
        `${event.type} ${sub.id}: no reader matches this subscription.`,
      );
      await this.record(event, null);
      return;
    }

    const data = this.planFor(sub);
    const dead = DEAD.has(sub.status);

    await this.prisma.$transaction(async (tx) => {
      await tx.stripeEvent.create({
        data: { id: event.id, type: event.type, readerId: reader.id },
      });
      await tx.reader.update({
        where: { id: reader.id },
        data: {
          ...data,
          // planStartedAt is set once, on the first event that grants the
          // plan. Rewriting it on every renewal would make "new
          // subscribers this month" mean "everyone who renewed".
          ...(data.plan === 'PREMIUM' && reader.planStartedAt === null
            ? { planStartedAt: new Date() }
            : {}),
          // The customer id survives a cancellation — same person, same
          // invoice history, and a resubscription finds them again.
          stripeSubscriptionId: dead ? null : sub.id,
        },
      });
    });

    this.logger.log(
      `Reader ${reader.id}: subscription ${sub.status} → plan ${data.plan}.`,
    );
  }

  /**
   * Which reader a subscription belongs to.
   *
   * Three ways, in order of how much we trust them: the metadata we put
   * on it ourselves, the subscription id we already stored, and the
   * customer id. The fallbacks matter because a subscription created
   * from the Stripe dashboard by hand carries no metadata of ours.
   */
  private async findReaderFor(sub: Stripe.Subscription) {
    const select = { id: true, planStartedAt: true } as const;
    const readerId = sub.metadata?.readerId;
    if (readerId) {
      const byMeta = await this.prisma.reader.findUnique({
        where: { id: readerId },
        select,
      });
      if (byMeta) return byMeta;
    }

    const bySub = await this.prisma.reader.findUnique({
      where: { stripeSubscriptionId: sub.id },
      select,
    });
    if (bySub) return bySub;

    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    return this.prisma.reader.findUnique({
      where: { stripeCustomerId: customerId },
      select,
    });
  }
}

/**
 * The end of the paid period, wherever Stripe is keeping it.
 *
 * It moved: `current_period_end` used to sit on the subscription and now
 * lives on each subscription item. Both shapes are read so the handler
 * survives an account being upgraded to a newer API version, which is
 * the sort of thing that happens without a deploy.
 */
export function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const flat = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  if (typeof flat === 'number') return new Date(flat * 1000);

  const ends = (sub.items?.data ?? [])
    .map((i) => (i as unknown as { current_period_end?: number }).current_period_end)
    .filter((v): v is number => typeof v === 'number');
  if (ends.length === 0) return null;

  // The latest, so a subscription with more than one item entitles the
  // reader for as long as any part of it is paid up.
  return new Date(Math.max(...ends) * 1000);
}
