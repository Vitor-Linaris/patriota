import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { StaffNotificationsService } from './staff-notifications.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';

/**
 * The sino. No @RequirePermissions anywhere here — every member of
 * staff has their own notifications and reads only their own row
 * (recipientId is always the caller's id, never a param), so the only
 * gate that applies is being logged in at all, which the global guard
 * already enforces.
 */
@Controller('admin/notificacoes')
export class StaffNotificationsController {
  constructor(private readonly service: StaffNotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.list(user.id, limit);
  }

  @Post(':id/ler')
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.service.markRead(id, user.id);
    return { ok: true };
  }

  @Post('marcar-todas-lidas')
  async markAllRead(@CurrentUser() user: AuthUser) {
    await this.service.markAllRead(user.id);
    return { ok: true };
  }
}
