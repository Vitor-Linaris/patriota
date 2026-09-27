import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MediaService } from './media.service';

/**
 * NOTE: this module must NOT call ScheduleModule.forRoot() — it is
 * already registered in ArticlesModule, and @Cron here is picked up by
 * that single root. Same note as SocialScheduler.
 */
@Injectable()
export class MediaPublishScheduler {
  private readonly logger = new Logger(MediaPublishScheduler.name);

  constructor(private readonly media: MediaService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async tick(): Promise<void> {
    try {
      await this.media.sweepPublished();
    } catch (err) {
      this.logger.error(
        `Media sweep falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
