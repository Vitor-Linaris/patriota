import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { CommentsService, type ActingStaff } from '../comments/comments.service';
import {
  toSkipTake,
  type PageResult,
} from '../common/dto/pagination.dto';
import type { ListReadersQueryDto } from './dto/list-readers.dto';
import type { Prisma } from '../../generated/prisma/client';
import {
  isSuspended,
  suspensionEndsAt,
  type SuspensionDuration,
} from '../reader-auth/reader-suspension';
import {
  lapsedPlanData,
  planActive,
} from '../reader-auth/reader-entitlement';

const READER_VIEW = {
  id: true,
  email: true,
  name: true,
  status: true,
  suspendedUntil: true,
  suspensionReason: true,
  suspendedBy: { select: { id: true, name: true } },
} as const;

/**
 * The newsroom's view of a reader.
 *
 * An explicit select, not an include: `Reader` carries a password hash,
 * an unsubscribe secret and a Stripe customer id, none of which have any
 * business being on an admin screen. This is the same lesson the public
 * article payload taught the hard way.
 */
const READER_ROW = {
  ...READER_VIEW,
  plan: true,
  planStatus: true,
  planRenewsAt: true,
  planSource: true,
  planNote: true,
  planGrantedBy: { select: { id: true, name: true } },
  emailVerifiedAt: true,
  createdAt: true,
  lastLoginAt: true,
  _count: { select: { comments: true } },
} as const;

@Injectable()
export class ReadersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly comments: CommentsService,
  ) {}

  async list(query: ListReadersQueryDto): Promise<PageResult<unknown>> {
    const where: Prisma.ReaderWhereInput = {};
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.plan) where.plan = query.plan;
    if (query.status) where.status = query.status;

    // "Banned right now" is a date question, not a status one: a row can
    // still say SUSPENSO with an end date from last week, because nothing
    // sweeps the column — it is tidied when a checkpoint next sees it.
    // Filtering on status alone would list people who are free to comment.
    if (query.suspended === 'true') {
      where.status = 'SUSPENSO';
      where.OR = [
        { suspendedUntil: null },
        { suspendedUntil: { gt: new Date() } },
      ];
      // A text search plus this filter would fight over `OR`. The search
      // is dropped rather than silently ANDed into nonsense; the UI
      // disables one while the other is on.
      if (query.q) delete where.OR;
    }

    const { skip, take } = toSkipTake(query);
    const [items, total] = await Promise.all([
      this.prisma.reader.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: READER_ROW,
      }),
      this.prisma.reader.count({ where }),
    ]);

    return {
      // `suspended` and `planActive` are computed rather than left to
      // the client. Both are the same kind of question — a status plus a
      // date — and the rule for each lives in one module. Two copies of
      // a date comparison, one of them in TypeScript in a browser, is
      // how the admin list ends up disagreeing with the paywall.
      items: items.map((r) => ({
        ...r,
        suspended: isSuspended(r),
        planActive: planActive(r),
      })),
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  /**
   * Counts across the whole table, not just the visible page — otherwise
   * the cards would change every time somebody turns a page.
   */
  async getStats() {
    const [total, byPlan, byStatus, bannedNow] = await Promise.all([
      this.prisma.reader.count(),
      this.prisma.reader.groupBy({ by: ['plan'], _count: { _all: true } }),
      this.prisma.reader.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.reader.count({
        where: {
          status: 'SUSPENSO',
          OR: [{ suspendedUntil: null }, { suspendedUntil: { gt: new Date() } }],
        },
      }),
    ]);

    const plan: Record<string, number> = { GRATIS: 0, PREMIUM: 0 };
    for (const row of byPlan) plan[row.plan] = row._count._all;

    const status: Record<string, number> = {
      PENDENTE_VERIFICACAO: 0,
      ATIVO: 0,
      SUSPENSO: 0,
      ANONIMIZADO: 0,
    };
    for (const row of byStatus) status[row.status] = row._count._all;

    return { total, plan, status, bannedNow };
  }

  /**
   * Bans a reader for a fixed period, or for good.
   *
   * Nothing schedules the release. `suspendedUntil` is the whole
   * mechanism — every checkpoint compares it against the clock, so the
   * ban ends by the calendar arriving rather than by a job remembering
   * to run. See reader-suspension.ts.
   */
  async suspend(
    readerId: string,
    duration: SuspensionDuration,
    staff: ActingStaff,
    opts: { reason?: string; purgeComments?: boolean } = {},
  ) {
    const reader = await this.prisma.reader.findUnique({
      where: { id: readerId },
      select: { id: true, email: true, name: true, status: true },
    });
    if (!reader) throw new NotFoundException('Leitor não encontrado.');

    // An anonymised account has no one behind it to punish, and writing
    // SUSPENSO over ANONIMIZADO would undo an erasure we are obliged to
    // honour.
    if (reader.status === 'ANONIMIZADO') {
      throw new BadRequestException('Esta conta já foi anonimizada.');
    }

    const until = suspensionEndsAt(duration);

    const updated = await this.prisma.reader.update({
      where: { id: readerId },
      data: {
        status: 'SUSPENSO',
        suspendedUntil: until,
        suspensionReason: opts.reason?.trim() || null,
        suspendedById: staff.id,
        // Strands every token already issued, so the ban starts now
        // rather than whenever their 30-day cookie happens to expire.
        tokenVersion: { increment: 1 },
      },
      select: READER_VIEW,
    });

    const purged = opts.purgeComments
      ? await this.comments.purgeByReader(readerId, staff)
      : 0;

    const label = until
      ? `até ${until.toISOString().slice(0, 10)}`
      : 'permanente';
    void this.activity.record({
      userId: staff.id,
      action: 'reader_suspended',
      targetType: 'reader',
      targetId: readerId,
      targetLabel:
        `${reader.name ?? reader.email} — ${label}` +
        (purged > 0 ? ` (${purged} comentários eliminados)` : ''),
    });

    return { ...updated, purgedComments: purged };
  }

  /** Lifts a ban early. The lapsed ones lift themselves. */
  async unsuspend(readerId: string, staff: ActingStaff) {
    const reader = await this.prisma.reader.findUnique({
      where: { id: readerId },
      select: { id: true, email: true, name: true, status: true, emailVerifiedAt: true },
    });
    if (!reader) throw new NotFoundException('Leitor não encontrado.');
    if (reader.status !== 'SUSPENSO') {
      throw new BadRequestException('Este leitor não está suspenso.');
    }

    const updated = await this.prisma.reader.update({
      where: { id: readerId },
      data: {
        // Not unconditionally ATIVO: someone banned before they ever
        // confirmed their address comes back still unconfirmed, or the
        // ban would have done the verifying for them.
        status: reader.emailVerifiedAt === null ? 'PENDENTE_VERIFICACAO' : 'ATIVO',
        suspendedUntil: null,
        suspensionReason: null,
        suspendedById: null,
      },
      select: READER_VIEW,
    });

    void this.activity.record({
      userId: staff.id,
      action: 'reader_unsuspended',
      targetType: 'reader',
      targetId: readerId,
      targetLabel: reader.name ?? reader.email,
    });

    return updated;
  }

  // ───────────────────────── subscriptions by hand ─────────────────────

  /**
   * Gives someone a subscription without them paying for it.
   *
   * For the cases every newsroom has: a columnist, a source, a
   * complaint worth settling, the two weeks somebody was promised at a
   * conference. Recorded as MANUAL with a name attached, so a month
   * later it is possible to answer "who gave this away and why".
   */
  async grantSubscription(
    readerId: string,
    staff: ActingStaff,
    opts: { until?: Date | null; note?: string } = {},
  ) {
    const reader = await this.prisma.reader.findUnique({
      where: { id: readerId },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        plan: true,
        planSource: true,
        stripeCustomerId: true,
      },
    });
    if (!reader) throw new NotFoundException('Leitor não encontrado.');
    if (reader.status === 'ANONIMIZADO') {
      throw new BadRequestException('Esta conta já foi anonimizada.');
    }

    // Refused rather than merged. Writing a gift over a live Stripe
    // subscription would leave the reader paying for something they have
    // been given, with the two sources disagreeing about when it ends —
    // and the next webhook would overwrite the gift anyway. Cancelling
    // the payment is a decision for a person, not a side effect here.
    if (reader.planSource === 'STRIPE' && reader.plan !== 'GRATIS') {
      throw new ConflictException(
        'Este leitor tem uma assinatura paga activa. Cancele-a primeiro no Stripe.',
      );
    }

    const until = opts.until ?? null;
    if (until && until.getTime() <= Date.now()) {
      // Otherwise the grant lapses on the way out of this method and the
      // admin is left looking at a reader who is somehow still free.
      throw new BadRequestException('A data de fim tem de ser no futuro.');
    }

    const updated = await this.prisma.reader.update({
      where: { id: readerId },
      data: {
        plan: 'PREMIUM',
        planStatus: 'oferecida',
        planRenewsAt: until,
        planSource: 'MANUAL',
        planGrantedById: staff.id,
        planNote: opts.note?.trim() || null,
      },
      select: READER_ROW,
    });

    void this.activity.record({
      userId: staff.id,
      action: 'reader_plan_granted',
      targetType: 'reader',
      targetId: readerId,
      targetLabel: `${reader.name ?? reader.email} — ${
        until ? `até ${until.toISOString().slice(0, 10)}` : 'sem data de fim'
      }`,
    });

    return {
      ...updated,
      suspended: isSuspended(updated),
      planActive: planActive(updated),
    };
  }

  /** Takes it back. Only ever a gift — a paid one is cancelled in Stripe. */
  async revokeSubscription(readerId: string, staff: ActingStaff) {
    const reader = await this.prisma.reader.findUnique({
      where: { id: readerId },
      select: { id: true, email: true, name: true, plan: true, planSource: true },
    });
    if (!reader) throw new NotFoundException('Leitor não encontrado.');
    if (reader.plan === 'GRATIS') {
      throw new BadRequestException('Este leitor não tem assinatura.');
    }
    if (reader.planSource === 'STRIPE') {
      throw new ConflictException(
        'Esta assinatura é paga. Cancele-a no Stripe, não aqui.',
      );
    }

    const updated = await this.prisma.reader.update({
      where: { id: readerId },
      data: lapsedPlanData(),
      select: READER_ROW,
    });

    void this.activity.record({
      userId: staff.id,
      action: 'reader_plan_revoked',
      targetType: 'reader',
      targetId: readerId,
      targetLabel: reader.name ?? reader.email,
    });

    return {
      ...updated,
      suspended: isSuspended(updated),
      planActive: planActive(updated),
    };
  }

  /** The suspension state of one reader, for the moderation panel. */
  async suspensionOf(readerId: string) {
    const reader = await this.prisma.reader.findUnique({
      where: { id: readerId },
      select: READER_VIEW,
    });
    if (!reader) throw new NotFoundException('Leitor não encontrado.');
    // `status` alone lies once an end date has passed, so answer with the
    // question the caller actually has.
    return { ...reader, suspended: isSuspended(reader) };
  }
}
