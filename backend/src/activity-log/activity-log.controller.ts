import { Controller, Get, Query } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PageQueryDto } from '../common/dto/pagination.dto';

@Controller('admin/activity')
export class ActivityLogController {
  constructor(private readonly service: ActivityLogService) {}

  @Get()
  @RequirePermissions('utilizadores.ver')
  list(@Query() query: PageQueryDto) {
    return this.service.list(query);
  }
}
