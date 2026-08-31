import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
      // `suspended` is computed rather than left to the client: the rule
      // for reading it off status + date lives in one place, and this is
      // that place's answer.
      items: items.map((r) => ({ ...r, suspended: isSuspended(r) })),
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
