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
  | 'category'
  | 'media'
  | 'campaign'
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
   */
  async record(input: RecordActivityInput): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          userId: input.userId,
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
