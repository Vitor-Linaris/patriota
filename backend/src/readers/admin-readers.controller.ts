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
}
