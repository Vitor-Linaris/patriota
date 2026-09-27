import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StaffNotificationsService } from './staff-notifications.service';

/**
 * NOTE: must NOT call ScheduleModule.forRoot() — already registered once
 * in ArticlesModule. Same warning as every other scheduler in this
 * codebase, for the same reason.
 */
@Injectable()
export class StaffNotificationsScheduler {
  private readonly logger = new Logger(StaffNotificationsScheduler.name);

  constructor(private readonly notifications: StaffNotificationsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    try {
      await this.notifications.enqueueAuthorNotifications();
    } catch (err) {
      this.logger.error(
        `Tick falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
