import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
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

  /** Returns every subscriber in joinedAt-desc order. Used by the
   *  CSV / XLSX export endpoints; never paginated since the whole
   *  point of export is to dump the full list. */
  listAllSubscribers() {
    return this.prisma.newsletterSubscriber.findMany({
      orderBy: { joinedAt: 'desc' },
    });
  }

  async subscribe(email: string, name = '') {
    const lower = email.toLowerCase();
    try {
      return await this.prisma.newsletterSubscriber.create({
        data: { email: lower, name, status: 'ATIVO', segment: 'Geral' },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException('Este e-mail já está subscrito.');
      }
      throw e;
    }
  }
}
