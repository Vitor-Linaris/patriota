import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SettingsModule } from '../settings/settings.module';
import { StaffNotificationsModule } from '../staff-notifications/staff-notifications.module';

@Module({
  // O perfil precisa da lista de cadências que a redacção configura em
  // /admin/configuracoes — ver UsersService.getOwn.
  imports: [SettingsModule, StaffNotificationsModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
