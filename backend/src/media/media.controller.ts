import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
} from 'class-validator';
import { MediaService } from './media.service';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { PageQueryDto } from '../common/dto/pagination.dto';

const MAX_UPLOAD_BYTES = Number(
  process.env.MEDIA_MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024,
);

class CreateMediaDto {
  @IsUrl()
  url!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  height?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;

  @IsOptional()
  @IsString()
  mimeType?: string;
}

@Controller('admin/media')
export class MediaController {
  constructor(private readonly service: MediaService) {}

  @Get()
  @RequirePermissions('media.carregar')
  list(@Query() query: PageQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @RequirePermissions('media.carregar')
  create(@Body() dto: CreateMediaDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.id);
  }

  /**
   * File-upload flow. The multer interceptor uses memoryStorage so we
   * receive the raw buffer, run it through sharp (resize + WebP) and
   * persist 3 variants to disk. The size limit is enforced by multer
   * before our handler runs.
   */
  @Post('upload')
  @RequirePermissions('media.carregar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) {
      throw new BadRequestException('Ficheiro obrigatório.');
    }
    // Mime/type whitelisting + sharp validation happen inside the
    // service. ParseFilePipeBuilder.addFileTypeValidator was
    // unreliable across Nest versions (regex-vs-magic-byte mismatch),
    // so we keep validation in one place — the service.
    return this.service.uploadFile(file, user.id);
  }

  @Delete(':id')
  @RequirePermissions('media.eliminar')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user.id);
  }
}
