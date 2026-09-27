import { Module } from '@nestjs/common';
import { ReadersModule } from '../readers/readers.module';
import { VisitsModule } from '../visits/visits.module';
import { WeeklyReportService } from './weekly-report.service';
import { WeeklyReportScheduler } from './weekly-report.scheduler';

@Module({
  imports: [ReadersModule, VisitsModule],
  providers: [WeeklyReportService, WeeklyReportScheduler],
  exports: [WeeklyReportService],
})
export class WeeklyReportModule {}
