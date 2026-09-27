import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { StaffNotificationsModule } from '../staff-notifications/staff-notifications.module';

@Module({
  imports: [StaffNotificationsModule],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
