import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AdsService } from './ads.service';
import { MediaService } from '../media/media.service';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AdType } from '../../generated/prisma/enums';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

class UpdateAdDto {
  @IsOptional()
  @IsEnum(AdType)
  type?: AdType;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  linkUrl?: string | null;

  @IsOptional()
  @IsIn(['_blank', '_self'])
  linkTarget?: '_blank' | '_self';

  @IsOptional()
  @IsString()
  altText?: string | null;

  @IsOptional()
  @IsString()
  htmlCode?: string | null;
}

@Controller()
export class AdsController {
  constructor(
    private readonly service: AdsService,
    private readonly media: MediaService,
  ) {}

  // No decorator here meant no guard at all: RolesGuard only checks
  // anything when @Roles or @RequirePermissions is present, so this
  // endpoint was reachable by ANY authenticated staff member — a
  // REVISOR or ANALISTA included — regardless of role. Same permission
  // as update(), matching what the admin nav already gates this page
  // behind.
  @Get('admin/ads')
  @RequirePermissions('configuracoes.editar')
  list() {
    return this.service.list();
  }

  @Patch('admin/ads/:id')
  @RequirePermissions('configuracoes.editar')
  update(@Param('id') id: string, @Body() dto: UpdateAdDto) {
    return this.service.update(id, dto);
  }

  /**
   * Clears the slot's image, and deletes the file for good when it is
   * safe to — see MediaService.removeAdImage for what "safe" rules out.
   *
   * Its own permission, not `configuracoes.editar`: swapping a banner
   * is everyday work, and this cannot be undone.
   */
  @Delete('admin/ads/:id/image')
  @RequirePermissions('publicidade.eliminar_imagem')
  removeImage(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.media.removeAdImage(id, { id: user.id, role: user.role });
  }

  @Post('admin/ads/seed')
  @RequirePermissions('configuracoes.permissoes')
  async seed() {
    await this.service.ensureDefaults();
    return { ok: true };
  }

  @Public()
  @Get('public/ads/:page')
  byPage(@Param('page') page: string) {
    return this.service.listByPage(page);
  }
}
