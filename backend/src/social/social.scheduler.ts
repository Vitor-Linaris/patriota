import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SocialPublishingService } from './social-publishing.service';

/**
 * Cron jobs for the social-publishing pipeline.
 *
 * NOTE: this module must NOT call ScheduleModule.forRoot(). It is
 * already registered in ArticlesModule, and calling it twice is a
 * duplicate registration hazard — @Cron here is picked up by that single
 * root. Same note as ReaderNotificationsScheduler, and for the same
 * reason.
 *
 * Structure copied from articles.scheduler.ts: one exported runX(now)
 * per job on the service so tests can drive them with a fixed clock, and
 * a tick that swallows its own errors — a cron that throws takes nothing
 * with it, but a cron that throws QUIETLY is how a pipeline dies without
 * anybody noticing, so every catch logs.
 */
@Injectable()
export class SocialScheduler {
  private readonly logger = new Logger(SocialScheduler.name);

  constructor(private readonly social: SocialPublishingService) {}

  /**
   * Picks up newly published articles and writes the outbox rows.
   *
   * Every minute, matching the article scheduler, so a piece published
   * at 09:00 is queued by 09:01 whichever of the five publish paths
   * produced it. Queued, not posted: the delay lives on the row.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async enqueueTick(): Promise<void> {
    try {
      await this.social.enqueueDueArticles();
    } catch (err) {
      this.logger.error(
        `Enqueue tick falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Drains the queue.
   *
   * Also every minute, which is what makes the configured delay mean
   * what it says: a ten-minute window is ten minutes plus at most one
   * tick, not ten minutes plus however long until the next hour.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async deliverTick(): Promise<void> {
    try {
      await this.social.deliver();
    } catch (err) {
      this.logger.error(
        `Envio falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
