import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ReadersService } from './readers.service';
import { SuspendReaderDto } from './dto/suspend-reader.dto';
import { ListReadersQueryDto } from './dto/list-readers.dto';
import { GrantSubscriptionDto } from './dto/grant-subscription.dto';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';

/**
 * Newsroom-side administration of readers.
 *
 * Guarded by the global JwtAuthGuard + RolesGuard. Deliberately NOT behind
 * ReaderFeatureGuard, on the same reasoning as the moderation queue: if
 * the reader area is switched off, a moderator must still be able to deal
 * with whoever is already in the database.
 */
@Controller('admin/readers')
export class AdminReadersController {
  constructor(private readonly readers: ReadersService) {}

  // Static paths before the ':id' routes — same ordering rule as
  // articles.controller.ts, or /admin/readers/stats resolves as a reader
  // whose id is "stats" and comes back as a 404 from Prisma.
  @Get('stats')
  @RequirePermissions('leitores.ver')
  stats() {
    return this.readers.getStats();
  }

  @Get()
  @RequirePermissions('leitores.ver')
  list(@Query() query: ListReadersQueryDto) {
    return this.readers.list(query);
  }

  @Get(':id/suspension')
  @RequirePermissions('leitores.suspender')
  suspension(@Param('id') id: string) {
    return this.readers.suspensionOf(id);
  }

  @Post(':id/suspend')
  @RequirePermissions('leitores.suspender')
  @HttpCode(HttpStatus.OK)
  suspend(
    @Param('id') id: string,
    @Body() dto: SuspendReaderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.readers.suspend(id, dto.duration, user, {
      reason: dto.reason,
      purgeComments: dto.purgeComments,
    });
  }

  @Delete(':id/suspend')
  @RequirePermissions('leitores.suspender')
  @HttpCode(HttpStatus.OK)
  unsuspend(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.readers.unsuspend(id, user);
  }

  // Giving away a subscription is giving away money, so it sits behind
  // its own permission rather than riding on leitores.suspender — a
  // moderator clearing a comment queue has no business doing this.
  @Post(':id/subscription')
  @RequirePermissions('leitores.oferecer_assinatura')
  @HttpCode(HttpStatus.OK)
  grant(
    @Param('id') id: string,
    @Body() dto: GrantSubscriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.readers.grantSubscription(id, user, {
      until: dto.until ? new Date(dto.until) : null,
      note: dto.note,
    });
  }

  @Delete(':id/subscription')
  @RequirePermissions('leitores.oferecer_assinatura')
  @HttpCode(HttpStatus.OK)
  revoke(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.readers.revokeSubscription(id, user);
  }
}
