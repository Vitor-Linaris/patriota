import { Module } from '@nestjs/common';
import { ReaderNotificationsService } from './reader-notifications.service';
import { ReaderNotificationsScheduler } from './reader-notifications.scheduler';
import { UnsubscribeController } from './unsubscribe.controller';

/**
 * "New article in a category you follow", end to end: the poller that
 * claims newly published articles, the outbox it writes, the digest crons
 * that drain it, and the unsubscribe endpoints.
 *
 * Imports nothing schedule-related on purpose — ScheduleModule.forRoot()
 * lives in ArticlesModule and calling it twice is a duplicate
 * registration hazard. MailerModule is @Global.
 */
@Module({
  providers: [ReaderNotificationsService, ReaderNotificationsScheduler],
  controllers: [UnsubscribeController],
  exports: [ReaderNotificationsService],
})
export class ReaderNotificationsModule {}
