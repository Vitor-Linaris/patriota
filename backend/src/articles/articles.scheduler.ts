import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { MediaService } from '../media/media.service';

/**
 * Promotes articles whose `scheduledAt` has passed from AGENDADO to
 * PUBLICADO. Runs every minute.
 *
 * Design choices:
 *   • Only AGENDADO rows are considered — drafts (RASCUNHO) and items
 *     still under review (EM_REVISAO) need a human approval before
 *     they're eligible. An editor approving an EM_REVISAO with a
 *     scheduledAt should move the row to AGENDADO first; the cron
 *     then flips it at the right time.
 *   • `publishedAt = scheduledAt` so the article timeline is honest
 *     (the article shows the user-intended date, not the cron tick).
 *   • Promise.allSettled — one bad row doesn't block the rest.
 *   • Activity log records 'published_scheduled' so a UI can later
 *     tell "automatic" publications from manual ones.
 */
@Injectable()
export class ArticlesScheduler {
  private readonly logger = new Logger(ArticlesScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly media: MediaService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    await this.runDueArticles();
  }

  /**
   * Public for unit tests: scans for AGENDADO articles whose
   * scheduledAt is now in the past, publishes them, and logs.
   * Returns the number of articles promoted.
   */
  async runDueArticles(now = new Date()): Promise<number> {
    const due = await this.prisma.article.findMany({
      where: {
        status: 'AGENDADO',
        scheduledAt: { lte: now },
      },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        authorId: true,
        // Needed to publish the images along with the article — a
        // scheduled piece goes live with nobody watching, so a cover
        // that 404s would sit there until somebody noticed.
        coverImageUrl: true,
        content: true,
      },
    });
    if (due.length === 0) return 0;

    const results = await Promise.allSettled(
      due.map(async (a) => {
        await this.prisma.article.update({
          where: { id: a.id },
          data: {
            status: 'PUBLICADO',
            publishedAt: a.scheduledAt ?? now,
            scheduledAt: null,
            rejectionReason: null,
          },
        });
        await this.media.promoteForPublication(a.coverImageUrl, a.content);
        await this.activity.record({
          userId: a.authorId,
          action: 'published_scheduled',
          targetType: 'article',
          targetId: a.id,
          targetLabel: a.title,
        });
        return a.id;
      }),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - succeeded;
    this.logger.log(
      `Scheduler tick: promoted ${succeeded} / ${results.length} articles${
        failed > 0 ? ` (${failed} failed)` : ''
      }`,
    );
    return succeeded;
  }
}
