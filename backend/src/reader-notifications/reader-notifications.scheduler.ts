import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReaderNotificationsService } from './reader-notifications.service';

/**
 * How often the IMEDIATO batch goes out — the cadence almost every reader
 * is on, since it is now the default (see Reader.digestFrequency).
 *
 * ⚠ TEMPORARIAMENTE A CADA MINUTO, PARA TESTES.
 * O valor a usar em produção é EVERY_5_MINUTES: cinco minutos junta uma
 * publicação em série de seis artigos num único e-mail e mantém o
 * fornecedor de e-mail fora do caminho crítico do publish. Um minuto
 * existe só para não estar à espera enquanto se testa a pipeline.
 *
 * Para repor, trocar esta constante — é o único sítio.
 */
const IMMEDIATE_CRON = CronExpression.EVERY_MINUTE;

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
   * Immediate readers — the default cadence, and the one that matters.
   *
   * Batched rather than fired per article: a title publishing six pieces
   * in a row that sends six separate messages is how a newsroom gets
   * marked as spam by its own readers. See IMMEDIATE_CRON above for the
   * interval, and for the note about it being turned down for testing.
   */
  @Cron(IMMEDIATE_CRON)
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
