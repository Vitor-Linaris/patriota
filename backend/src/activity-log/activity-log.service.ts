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
  /** A pacote exclusivo — a set of articles sold for one payment. */
  | 'package'
  | 'setting';

export interface RecordActivityInput {
  userId: string;
  action: string;
  targetType: ActivityTargetType;
  targetId?: string;
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
    return {
      items,
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }
}
