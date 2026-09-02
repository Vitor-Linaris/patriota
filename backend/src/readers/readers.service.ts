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

/** How far ahead "a expirar em breve" looks. */
export const EXPIRY_HORIZON_DAYS = 30;
/** The window for "novas assinaturas". */
export const NEW_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function windowStart(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

function windowEnd(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/**
 * The questions the dashboard asks, as reusable clauses.
 *
 * Shared with list() on purpose. Every figure on the dashboard is a link
 * into the list filtered the same way, and the only way to guarantee the
 * count and the list agree is for both to be this one function — not two
 * copies somebody has to remember to change together. A card that reads
 * 12 and opens a list of 15 is worse than a card that links nowhere.
 */
function activePlanWhere(now: Date): Prisma.ReaderWhereInput {
  return {
    plan: 'PREMIUM',
    OR: [{ planRenewsAt: null }, { planRenewsAt: { gt: now } }],
  };
}

function suspendedNowWhere(now: Date): Prisma.ReaderWhereInput {
  return {
    status: 'SUSPENSO',
    OR: [{ suspendedUntil: null }, { suspendedUntil: { gt: now } }],
  };
}

/**
 * Gifts running out inside the horizon — the list to write to.
 *
 * MANUAL only. Once Stripe is live a renewal five days out is routine
 * and needs nobody; a GIVEN subscription ending is the one somebody has
 * to decide about, and the one worth a "renova?" mail.
 */
function expiringWhere(now: Date): Prisma.ReaderWhereInput {
  return {
    plan: 'PREMIUM',
    planSource: 'MANUAL',
    planRenewsAt: { gt: now, lte: windowEnd(now, EXPIRY_HORIZON_DAYS) },
  };
}

/**
 * Who walked away, and when.
 *
 * By `planCanceledAt` — the day they clicked cancel — and NOT by the day
 * their access stops. Those are different dates, often a month apart,
 * and the newsroom needs the first one: churn is worth seeing while
 * there is still time to write to the person, not after they are gone.
 *
 * Deliberately NOT limited to people who still have access. Somebody who
 * cancelled three weeks ago and whose period ran out yesterday is still
 * one of last month's cancellations — dropping them the moment their
 * access lapses would make the figure quietly shrink as the month went
 * on, which is the opposite of what a churn number is for.
 */
function cancelledWhere(now: Date, days: number): Prisma.ReaderWhereInput {
  return { planCanceledAt: { gte: windowStart(now, days) } };
}

/** Cancelled, but still reading — the period they paid for is running. */
function cancelledInGraceWhere(now: Date): Prisma.ReaderWhereInput {
  return {
    plan: 'PREMIUM',
    planCancelAtPeriodEnd: true,
    planCanceledAt: { not: null },
    planRenewsAt: { gt: now },
  };
}

/**
 * How far back the cancellations list may look.
 *
 * A closed set rather than a free number: these become an index scan
 * over a column somebody can point at the whole table with, and three
 * windows cover what anybody actually asks — this month, this half-year,
 * this year.
 */
export const CANCELLED_WINDOWS = [30, 180, 365] as const;
export type CancelledWindow = (typeof CANCELLED_WINDOWS)[number];
/** What the dashboard card shows without being asked. */
export const CANCELLED_DEFAULT_DAYS: CancelledWindow = 30;

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
  planCancelAtPeriodEnd: true,
  planCanceledAt: true,
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

  /**
   * Built as a list of AND clauses rather than by assigning onto one
   * object.
   *
   * Several of these filters need an `OR` of their own — "banned right
   * now" is "no end date OR a future one" — and writing them onto a
   * shared `where.OR` meant the last one silently won. The text search
   * used to be dropped whenever a date filter was on, for exactly that
   * reason. Composed like this each clause keeps its own OR and they
   * intersect, so search now works alongside every filter.
   */
  async list(query: ListReadersQueryDto): Promise<PageResult<unknown>> {
    const now = new Date();
    const and: Prisma.ReaderWhereInput[] = [];

    if (query.q) {
      and.push({
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.plan) and.push({ plan: query.plan });
    if (query.status) and.push({ status: query.status });

    // "Banned right now" is a date question, not a status one: a row can
    // still say SUSPENSO with an end date from last week, because nothing
    // sweeps the column — it is tidied when a checkpoint next sees it.
    // Filtering on status alone would list people who are free to comment.
    if (query.suspended === 'true') and.push(suspendedNowWhere(now));

    // These three are the dashboard's figures, as filters. Same helpers,
    // same window constants — the count and the list it opens are the
    // same query by construction.
    if (query.active === 'true') and.push(activePlanWhere(now));
    if (query.newPlans === 'true') {
      and.push(activePlanWhere(now), {
        planStartedAt: { gte: windowStart(now, NEW_WINDOW_DAYS) },
      });
    }
    if (query.expiring === 'true') and.push(expiringWhere(now));

    // Cancellations, over a window the caller chooses. The dashboard
    // links here with the 30 days it shows; the page then offers 6
    // months and a year for looking at the trend rather than the week.
    if (query.cancelled === 'true') {
      const days = Number(query.cancelledDays);
      and.push(
        cancelledWhere(
          now,
          (CANCELLED_WINDOWS as readonly number[]).includes(days)
            ? days
            : CANCELLED_DEFAULT_DAYS,
        ),
      );
    }
    // Cancelled and still inside the paid period — the ones there is
    // still time to write to.
    if (query.inGrace === 'true') and.push(cancelledInGraceWhere(now));

    const where: Prisma.ReaderWhereInput = and.length ? { AND: and } : {};

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
   *
   * Every subscriber figure here is counted BY DATE, never by
   * `plan = PREMIUM` alone. A row keeps saying PREMIUM after its end
   * date until a checkpoint happens to tidy it, so the plain count
   * overstates — and the number it overstates is the one somebody would
   * put in a report about how the paid product is doing.
   */
  async getStats() {
    const now = new Date();
    const activeWhere = activePlanWhere(now);
    const expiringSoonWhere = expiringWhere(now);
    const since = windowStart(now, NEW_WINDOW_DAYS);

    const [
      total,
      byPlan,
      byStatus,
      bannedNow,
      activeBySource,
      newRecently,
      expiringSoon,
      expiring,
      cancelledRecently,
      cancelledInGrace,
      cancelled,
    ] = await Promise.all([
      this.prisma.reader.count(),
      this.prisma.reader.groupBy({ by: ['plan'], _count: { _all: true } }),
      this.prisma.reader.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.reader.count({ where: suspendedNowWhere(now) }),
      this.prisma.reader.groupBy({
        by: ['planSource'],
        where: activeWhere,
        _count: { _all: true },
      }),
      this.prisma.reader.count({
        // AND, not a spread: activeWhere carries its own OR, and
        // spreading would have `planStartedAt` sit beside it rather than
        // narrowing it — the same trap list() used to fall into.
        where: { AND: [activeWhere, { planStartedAt: { gte: since } }] },
      }),
      this.prisma.reader.count({ where: expiringSoonWhere }),
      this.prisma.reader.findMany({
        where: expiringSoonWhere,
        orderBy: { planRenewsAt: 'asc' },
        take: 5,
        select: {
          id: true,
          name: true,
          email: true,
          planRenewsAt: true,
          planNote: true,
        },
      }),
      this.prisma.reader.count({
        where: cancelledWhere(now, CANCELLED_DEFAULT_DAYS),
      }),
      this.prisma.reader.count({ where: cancelledInGraceWhere(now) }),
      this.prisma.reader.findMany({
        where: cancelledWhere(now, CANCELLED_DEFAULT_DAYS),
        // Most recent first: the newest cancellation is the one there is
        // most still to do about.
        orderBy: { planCanceledAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          email: true,
          planCanceledAt: true,
          planRenewsAt: true,
          planSource: true,
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

    let paid = 0;
    let gifted = 0;
    for (const row of activeBySource) {
      if (row.planSource === 'STRIPE') paid = row._count._all;
      else if (row.planSource === 'MANUAL') gifted = row._count._all;
    }
    const active = paid + gifted;

    return {
      total,
      plan,
      status,
      bannedNow,
      subscriptions: {
        /** Live right now, by date. NOT the same as plan.PREMIUM. */
        active,
        paid,
        gifted,
        /**
         * Readers on PREMIUM whose end date has already passed. The gap
         * between this and plan.PREMIUM is exactly the rows waiting to
         * be tidied, and showing it stops the two numbers looking like a
         * bug when they disagree.
         */
        lapsed: Math.max(0, (plan.PREMIUM ?? 0) - active),
        free: plan.GRATIS ?? 0,
        newRecently,
        newWindowDays: NEW_WINDOW_DAYS,
        expiringSoon,
        expiryHorizonDays: EXPIRY_HORIZON_DAYS,
        expiring,
        /**
         * Churn. Counted by the day somebody CANCELLED, not the day
         * their access runs out — those are different dates, and this
         * is the one the newsroom can still do something about.
         */
        cancelledRecently,
        cancelledWindowDays: CANCELLED_DEFAULT_DAYS,
        /**
         * Of those, the ones still reading: cancelled, but the period
         * they paid for has not run out. The window in which a "fique
         * connosco" mail can still land while they are a subscriber.
         */
        cancelledInGrace,
        /**
         * Each row carries whether they are still reading, and how many
         * days are left, rather than the page working it out from the
         * date. The clock that matters is this one — the browser's may
         * be minutes or a timezone out — and a page that reads the
         * clock while rendering is not a pure render.
         */
        cancelled: cancelled.map((r) => {
          const left =
            r.planRenewsAt === null
              ? null
              : Math.ceil((r.planRenewsAt.getTime() - now.getTime()) / DAY_MS);
          return {
            ...r,
            stillReading: left !== null && left > 0,
            daysLeft: left !== null && left > 0 ? left : null,
          };
        }),
      },
    };
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
        planStartedAt: new Date(),
        planSource: 'MANUAL',
        // A gift never renews — there is no card behind it. Set so the
        // reader's own page says "Termina a X" rather than promising a
        // renewal that nothing would carry out. `until` may be null
        // (open-ended gift), in which case there is no end to announce.
        planCancelAtPeriodEnd: until !== null,
        // Nobody cancelled this; it was given with an end already on it.
        planCanceledAt: null,
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
