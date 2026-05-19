import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { VisitsModule } from '../visits/visits.module';

@Module({
  imports: [VisitsModule],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
