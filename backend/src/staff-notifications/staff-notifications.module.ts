import { Module } from '@nestjs/common';
import { StaffNotificationsService } from './staff-notifications.service';
import { StaffNotificationsScheduler } from './staff-notifications.scheduler';
import { StaffNotificationsController } from './staff-notifications.controller';

/**
 * The sino, end to end: who is eligible for each area (read straight
 * from RolePermissions, deliberately not through RbacModule — see the
 * comment on RECIPIENT_PERMISSION for why), the outbox, the poller that
 * tells an author their piece went out, and the endpoints behind the
 * bell icon.
 *
 * Imports nothing schedule-related — ScheduleModule.forRoot() lives in
 * ArticlesModule and calling it twice is a duplicate registration
 * hazard.
 */
@Module({
  providers: [StaffNotificationsService, StaffNotificationsScheduler],
  controllers: [StaffNotificationsController],
  exports: [StaffNotificationsService],
})
export class StaffNotificationsModule {}
