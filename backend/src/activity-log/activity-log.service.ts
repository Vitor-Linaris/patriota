import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PageQueryDto,
  PageResult,
  toSkipTake,
} from '../common/dto/pagination.dto';

export type ActivityTargetType =
  | 'article'
  | 'comment'
  | 'user'
  /** A public reader, as distinct from 'user', which is newsroom staff. */
  | 'reader'
  | 'category'
  | 'media'
  | 'campaign'
  /** One address on the newsletter list. */
  | 'newsletter-subscriber'
  /** A pacote exclusivo — a set of articles sold for one payment. */
  | 'package'
  | 'setting';

export interface RecordActivityInput {
  userId: string;
  action: string;
  targetType: ActivityTargetType;
  targetId?: string;
  /**
   * What the entry says about its target, MINUS the target's identity.
   *
   * For `targetType: 'reader'` this must never contain the reader's
   * e-mail or name. Six call sites used to write the address in here as
   * free text while already storing `targetId` next to it — and this
   * table has no readerId, so the RGPD erasure transaction had nothing
   * to find and nothing to clear. The address outlived the account that
   * asked to be forgotten, and came back out of GET /admin/activity
   * unfiltered.
   *
   * The identity is resolved at READ time instead; see list(). Put the
   * detail here ("permanente", "até 2027-01-01", the pacote name) and
   * nothing else. A staff actor is different — see actorLabel in
   * record() — because an audit trail that cannot name who acted is not
   * an audit trail.
   */
  targetLabel: string;
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an activity entry. Errors are swallowed (logged) so that
   * business operations are never blocked by an audit log failure.
   *
   * The actor's label is resolved HERE and stored on the row, rather than
   * being read through the relation at display time. The relation is
   * onDelete: SetNull, so deleting the account leaves userId null — and
   * without a denormalised label the entry would survive the deletion
   * unattributable, which is only marginally better than the cascade that
   * used to delete it outright. One primary-key lookup, on a call that is
   * already fire-and-forget at all of its call sites.
   */
  async record(input: RecordActivityInput): Promise<void> {
    try {
      const actor = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { name: true, email: true },
      });
      await this.prisma.activityLog.create({
        data: {
          userId: input.userId,
          actorLabel: actor
            ? `${actor.name} <${actor.email}>`
            : `(conta removida: ${input.userId})`,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          targetLabel: input.targetLabel,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record activity (${input.action}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * One page of the trail, with reader identities resolved LIVE.
   *
   * The identity of a reader is never stored on these rows — see
   * targetLabel — so it is looked up here, once per page, from the
   * account that still exists. Which means erasure works by itself: an
   * anonymised reader comes back as "Leitor removido" from the next
   * render onwards, with no sweep of this table and no column for anyone
   * to forget. It is the same answer the comment threads already give
   * for a deleted reader, one module over.
   */
  async list(query: PageQueryDto): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);
    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      }),
      this.prisma.activityLog.count(),
    ]);

    const readerIds = [
      ...new Set(
        items
          .filter((i) => i.targetType === 'reader' && i.targetId)
          .map((i) => i.targetId!),
      ),
    ];
    const readers = readerIds.length
      ? await this.prisma.reader.findMany({
          where: { id: { in: readerIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const byId = new Map(readers.map((r) => [r.id, r]));

    return {
      items: items.map((i) => {
        if (i.targetType !== 'reader' || !i.targetId) return i;
        const r = byId.get(i.targetId);
        // anonymise() keeps the row and rewrites the address to
        // anonimizado+<id>@invalid.local. Printing that back would be
        // technically accurate and useless to read.
        const identity =
          !r || r.email.endsWith('@invalid.local')
            ? 'Leitor removido'
            : (r.name ?? r.email);
        return {
          ...i,
          targetLabel: i.targetLabel
            ? `${identity} — ${i.targetLabel}`
            : identity,
        };
      }),
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }
}
