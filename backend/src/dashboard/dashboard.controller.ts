import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';

@Controller('admin/stats')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  /**
   * `artigos.ler` is the floor for reaching the dashboard at all —
   * everyone in the newsroom has it. What comes back is then scaled to
   * the caller inside the service; see the note there for why a single
   * blanket permission would be the wrong shape.
   */
  @Get()
  @RequirePermissions('artigos.ler')
  get(@CurrentUser() user: AuthUser) {
    return this.service.getStats({ id: user.id, role: user.role });
  }
}
