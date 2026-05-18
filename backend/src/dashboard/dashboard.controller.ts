import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('admin/stats')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  get() {
    return this.service.getStats();
  }
}
