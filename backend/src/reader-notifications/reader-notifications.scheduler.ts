import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReaderNotificationsService } from './reader-notifications.service';

/**
 * Cron jobs for the category-notification pipeline.
 *
 * NOTE: this module must NOT call ScheduleModule.forRoot(). It is already
 * registered in ArticlesModule, and calling it twice is a duplicate
 * registration hazard — @Cron here is picked up by that single root.
 *
 * Structure copied from articles.scheduler.ts: an exported runX(now) per
 * job so unit tests can drive them with a fixed clock, Promise-free
 * sequencing, and a log line per tick that actually did something.
 */
@Injectable()
export class ReaderNotificationsScheduler {
  private readonly logger = new Logger(ReaderNotificationsScheduler.name);

  constructor(private readonly notifications: ReaderNotificationsService) {}

  /**
   * Picks up newly published articles and writes the outbox rows.
   *
   * Every minute, matching the article scheduler, so a piece published at
   * 09:00 is queued by 09:01 regardless of which of the four publish
   * paths produced it.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async enqueueTick(): Promise<void> {
    try {
      await this.notifications.enqueueDueArticles();
    } catch (err) {
      this.logger.error(
        `Enqueue tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Immediate readers. Five minutes rather than one: it coalesces a batch
   * publish of six articles into a single e-mail and keeps the mail
   * provider off the hot path.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async immediateTick(): Promise<void> {
    try {
      await this.notifications.deliver('IMEDIATO');
    } catch (err) {
      this.logger.error(
        `Immediate digest failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Daily digest — the default cadence — at 08:00 Lisbon time. */
  @Cron('0 8 * * *', { timeZone: 'Europe/Lisbon' })
  async dailyTick(): Promise<void> {
    try {
      await this.notifications.deliver('DIARIO');
    } catch (err) {
      this.logger.error(
        `Daily digest failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Weekly digest, Mondays at 08:00 Lisbon time. */
  @Cron('0 8 * * 1', { timeZone: 'Europe/Lisbon' })
  async weeklyTick(): Promise<void> {
    try {
      await this.notifications.deliver('SEMANAL');
    } catch (err) {
      this.logger.error(
        `Weekly digest failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Nightly prune of the delivery ledger. */
  @Cron('30 4 * * *', { timeZone: 'Europe/Lisbon' })
  async pruneTick(): Promise<void> {
    try {
      const removed = await this.notifications.pruneOldNotifications();
      if (removed > 0) {
        this.logger.log(`Pruned ${removed} old notification row(s).`);
      }
    } catch (err) {
      this.logger.error(
        `Prune failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
