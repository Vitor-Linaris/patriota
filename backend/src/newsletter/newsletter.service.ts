import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { MailerService } from '../mailer/mailer.service';
import { escapeHtml, renderLayout } from '../mailer/templates/layout';
import {
  PageQueryDto,
  PageResult,
  toSkipTake,
} from '../common/dto/pagination.dto';
import { CampaignStatus, SubscriberStatus } from '../../generated/prisma/enums';

export interface CampaignInput {
  subject: string;
  preview?: string;
  segment?: string;
  header?: string;
  body?: string;
  ctaText?: string;
  ctaUrl?: string;
  footer?: string;
  scheduledAt?: string | null;
}

@Injectable()
export class NewsletterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly mailer: MailerService,
  ) {}

  // ── Campaigns ─────────────────────────────────────────────────────
  async listCampaigns(query: PageQueryDto): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);
    const [items, total] = await Promise.all([
      this.prisma.newsletterCampaign.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.newsletterCampaign.count(),
    ]);
    return {
      items,
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  createCampaign(input: CampaignInput) {
    return this.prisma.newsletterCampaign.create({
      data: {
        subject: input.subject,
        preview: input.preview ?? '',
        segment: input.segment ?? 'Todos',
        header: input.header ?? '',
        body: input.body ?? '',
        ctaText: input.ctaText ?? '',
        ctaUrl: input.ctaUrl ?? '',
        footer: input.footer ?? '',
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        status: input.scheduledAt ? 'AGENDADA' : 'RASCUNHO',
      },
    });
  }

  async updateCampaign(id: string, input: Partial<CampaignInput>) {
    try {
      return await this.prisma.newsletterCampaign.update({
        where: { id },
        data: {
          ...input,
          scheduledAt: input.scheduledAt
            ? new Date(input.scheduledAt)
            : undefined,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2025') {
        throw new NotFoundException();
      }
      throw e;
    }
  }

  async sendCampaign(id: string, userId: string) {
    const campaign = await this.prisma.newsletterCampaign.findUnique({
      where: { id },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada.');
    if (campaign.status === CampaignStatus.ENVIADA) {
      throw new BadRequestException('Já enviada.');
    }
    const recipients = await this.prisma.newsletterSubscriber.count({
      where: { status: SubscriberStatus.ATIVO },
    });
    const updated = await this.prisma.newsletterCampaign.update({
      where: { id },
      data: {
        status: 'ENVIADA',
        sentAt: new Date(),
        recipients,
      },
    });
    void this.activity.record({
      userId,
      action: 'newsletter-sent',
      targetType: 'campaign',
      targetId: id,
      targetLabel: campaign.subject,
    });
    return updated;
  }

  // ── Subscribers ───────────────────────────────────────────────────
  async listSubscribers(
    query: PageQueryDto & { q?: string },
  ): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);
    const where = query.q
      ? {
          OR: [
            { email: { contains: query.q, mode: 'insensitive' as const } },
            { name: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({
        where,
        skip,
        take,
        orderBy: { joinedAt: 'desc' },
      }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  /**
   * Whole-corpus counts shown on the admin dashboard stats card.
   * Calculated independently of the current page filter so the
   * "Total" number doesn't shrink when the user searches.
   */
  async subscriberStats() {
    const [total, ativo, inativo, cancelado] = await Promise.all([
      this.prisma.newsletterSubscriber.count(),
      this.prisma.newsletterSubscriber.count({
        where: { status: SubscriberStatus.ATIVO },
      }),
      this.prisma.newsletterSubscriber.count({
        where: { status: SubscriberStatus.INATIVO },
      }),
      this.prisma.newsletterSubscriber.count({
        where: { status: SubscriberStatus.CANCELADO },
      }),
    ]);
    return { total, ativo, inativo, cancelado };
  }

  /**
   * Every subscriber the newsroom may still write to, joinedAt-desc.
   * Used by the CSV / XLSX export endpoints; never paginated, since the
   * point of an export is the whole list.
   *
   * CANCELADO is excluded, and that is the whole reason this comment
   * exists. An export is how a list leaves this system and arrives
   * somewhere with no memory of who opted out — a mail tool, a
   * spreadsheet, a colleague's laptop. Shipping the cancelled addresses
   * inside it is how somebody who asked to be left alone gets written to
   * again six months later. They remain visible in the admin list, which
   * is where a suppression record belongs.
   */
  listAllSubscribers() {
    return this.prisma.newsletterSubscriber.findMany({
      where: { status: { not: SubscriberStatus.CANCELADO } },
      orderBy: { joinedAt: 'desc' },
    });
  }

  /**
   * RGPD erasure, by the subscriber themselves.
   *
   * A real delete, not a status change. `CANCELADO` is the right record
   * for "do not write to me again" — it is a suppression entry and it
   * has to survive. "Forget me" is a different request, and this table
   * had no way to honour it at all: no delete path anywhere, public or
   * admin, and no relation to Reader for the reader-side erasure to
   * reach. The address and name simply stayed, for ever.
   *
   * Silent on a token that matches nothing: this endpoint is reachable
   * by anybody with a link, and the difference between "deleted" and
   * "no such token" is not information it needs to give out.
   */
  async forget(token: string): Promise<{ ok: true }> {
    await this.prisma.newsletterSubscriber.deleteMany({
      where: { manageToken: token },
    });
    return { ok: true };
  }

  /**
   * RGPD erasure on behalf of somebody who asked by other means — a
   * reply to a newsletter, a letter, a phone call.
   *
   * The public token path covers the person who still has the link. This
   * covers everybody else, which in practice is most of them, and it is
   * the half that makes the obligation answerable at all: before this,
   * an erasure request against this table could not be honoured by
   * anyone, through any interface.
   */
  async removeSubscriber(id: string, actorId: string) {
    const row = await this.prisma.newsletterSubscriber.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
    if (!row) throw new NotFoundException('Subscritor não encontrado.');
    await this.prisma.newsletterSubscriber.delete({ where: { id } });
    void this.activity.record({
      userId: actorId,
      action: 'newsletter-subscriber-deleted',
      targetType: 'newsletter-subscriber',
      targetId: row.id,
      // NOT the address. The point of the erasure is that it stops
      // existing here; writing it into the audit trail on the way out
      // would simply move it to another table that has no delete path
      // either. See activity-log.service.ts on the same rule.
      targetLabel: 'subscritor apagado',
    });
    return { ok: true as const };
  }

  /**
   * The subscriber behind a manage link, or null.
   *
   * Returns the address so the page can show WHICH subscription is about
   * to be cancelled or erased — a link with no name on it is a link
   * people click without knowing what it does.
   */
  async describeByToken(token: string) {
    const row = await this.prisma.newsletterSubscriber.findUnique({
      where: { manageToken: token },
      select: { email: true, name: true, status: true },
    });
    if (!row) throw new NotFoundException('Ligação inválida ou já utilizada.');
    return row;
  }

  /**
   * Public subscribe. Always answers the same thing.
   *
   * It used to throw 409 "este e-mail já está subscrito", which made the
   * form a free membership oracle: type an address, read the answer,
   * learn whether that person reads this newspaper. Its own sibling —
   * unsubscribe — masks exactly that fact on purpose, and has a comment
   * saying so. One neutral answer for every case.
   *
   * A CANCELADO row is NOT promoted back. Reactivating somebody's
   * cancelled subscription from an unauthenticated form is the abuse:
   * the one deliberate act a person took to stop hearing from this
   * newspaper could be undone by any stranger who knew the address. They
   * come back through the link in their own inbox, or through an admin.
   */
  async subscribe(email: string, name = ''): Promise<{ ok: true }> {
    const lower = email.toLowerCase();
    const existing = await this.prisma.newsletterSubscriber.findUnique({
      where: { email: lower },
      select: { id: true, status: true, name: true, manageToken: true },
    });

    if (!existing) {
      const created = await this.prisma.newsletterSubscriber.create({
        data: { email: lower, name, status: 'ATIVO', segment: 'Geral' },
        select: { manageToken: true },
      });
      void this.sendManageLink(lower, name, created.manageToken, 'welcome');
      return { ok: true };
    }

    if (existing.status === SubscriberStatus.INATIVO) {
      // INATIVO is an operational state (a bounce, an admin pause), not
      // a decision by the person. Their own address asking to be on the
      // list again is enough to lift it.
      await this.prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: { status: 'ATIVO', name: name || existing.name },
      });
      return { ok: true };
    }

    if (existing.status === SubscriberStatus.CANCELADO) {
      // Not reactivated here. The link goes to the inbox that owns the
      // address, which is the only place the decision can be reversed.
      void this.sendManageLink(lower, existing.name, existing.manageToken, 'return');
    }

    return { ok: true };
  }

  /**
   * Public "cancel my subscription" — the caller supplies an address and
   * gets a link, never an immediate cancellation.
   *
   * The address in the body used to BE the authorisation: anybody could
   * type somebody else's e-mail and take them off the list, silently and
   * permanently, with the endpoint returning success either way. Nothing
   * about that request proves who sent it. The link does, because it
   * only ever arrives in the inbox that owns the address.
   *
   * Still idempotent and still silent about membership: an address that
   * is not on the list gets the same answer, and no e-mail.
   */
  async requestManageLink(email: string): Promise<{ ok: true }> {
    const lower = email.toLowerCase();
    const row = await this.prisma.newsletterSubscriber.findUnique({
      where: { email: lower },
      select: { name: true, manageToken: true, status: true },
    });
    if (row && row.status !== SubscriberStatus.CANCELADO) {
      void this.sendManageLink(lower, row.name, row.manageToken, 'manage');
    }
    return { ok: true };
  }

  /** Acts on the token, which is the part only the owner has. */
  async unsubscribeByToken(token: string): Promise<{ ok: true }> {
    // CANCELADO rather than a delete: this is a suppression record, and
    // it has to survive precisely so the address is never written to
    // again. Erasure is a different request — see forget().
    await this.prisma.newsletterSubscriber.updateMany({
      where: { manageToken: token },
      data: { status: 'CANCELADO' },
    });
    return { ok: true };
  }

  /**
   * The one e-mail this module sends. Non-throwing: a mail outage must
   * not turn the public form into a 500, and the caller has already been
   * told the same neutral thing either way.
   */
  private async sendManageLink(
    email: string,
    name: string,
    token: string,
    reason: 'welcome' | 'manage' | 'return',
  ): Promise<void> {
    const siteName = await this.mailer.siteName();
    const url = `${this.mailer.siteUrl()}/newsletter/gerir?t=${encodeURIComponent(token)}`;

    const copy = {
      welcome: {
        subject: `Subscrição confirmada — ${siteName}`,
        heading: 'Está subscrito',
        body: 'Guarde esta mensagem: a ligação abaixo é a sua, e é por aí que cancela quando quiser.',
        cta: 'Gerir a minha subscrição',
      },
      manage: {
        subject: `Gerir a sua subscrição — ${siteName}`,
        heading: 'A sua subscrição',
        body: 'Pediu para gerir a subscrição deste endereço. A ligação abaixo permite cancelar ou apagar os seus dados.',
        cta: 'Cancelar ou apagar',
      },
      return: {
        subject: `Voltar a subscrever — ${siteName}`,
        heading: 'Quer voltar a receber?',
        body: 'Este endereço cancelou a subscrição, por isso não o reactivámos a pedido de um formulário. Se foi mesmo você, use a ligação abaixo.',
        cta: 'Gerir a minha subscrição',
      },
    }[reason];

    const greeting = name.trim() ? `Olá ${name.trim()},` : 'Olá,';

    await this.mailer.send({
      to: email,
      subject: copy.subject,
      html: renderLayout({
        siteName,
        preheader: copy.body,
        heading: copy.heading,
        bodyHtml: `<p style="margin:0;font-size:15px;line-height:1.65;color:#334155;">
            ${escapeHtml(greeting)}<br><br>${escapeHtml(copy.body)}
          </p>`,
        cta: { label: copy.cta, url },
      }),
      text: [greeting, '', copy.body, '', url].join('\n'),
      tag: 'newsletter-manage',
    });
  }
}
