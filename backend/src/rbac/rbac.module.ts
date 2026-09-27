import { Global, Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import { StaffNotificationsModule } from '../staff-notifications/staff-notifications.module';

@Global()
@Module({
  imports: [StaffNotificationsModule],
  providers: [RbacService],
  controllers: [RbacController],
  exports: [RbacService],
})
export class RbacModule {}
