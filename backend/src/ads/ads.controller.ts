import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AdsService } from './ads.service';
import { Public } from '../auth/public.decorator';
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
  constructor(private readonly service: AdsService) {}

  @Get('admin/ads')
  list() {
    return this.service.list();
  }

  @Patch('admin/ads/:id')
  @RequirePermissions('configuracoes.editar')
  update(@Param('id') id: string, @Body() dto: UpdateAdDto) {
    return this.service.update(id, dto);
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
