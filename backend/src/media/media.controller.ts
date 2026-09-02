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
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MulterExceptionFilter } from './multer-exception.filter';
import {
  IsIn,
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
import { MAX_ANIMATION_BYTES, MAX_VIDEO_BYTES } from './media-limits';

/**
 * Multer's cap on the image route.
 *
 * The ANIMATION limit, not the still one, and deliberately so. Multer
 * runs before any of our code and knows nothing about what the file is;
 * capping it at the 10 MB still limit would kill a 12 MB animated GIF —
 * which the service allows — with a bare 413 before the service ever
 * saw it.
 *
 * So the outer gate is the most generous of the two, and the service
 * applies the right one once it knows, from the bytes, whether this is
 * an animation.
 */
const MAX_UPLOAD_BYTES = MAX_ANIMATION_BYTES;

/**
 * Multer's cap on the video route.
 *
 * Its own route rather than a branch, because this is the one thing
 * decided before any of our code runs: a single route with this limit
 * would happily buffer a hundred megabytes of "image" into memory
 * before anything inspected it.
 */
const MAX_VIDEO_UPLOAD_BYTES = MAX_VIDEO_BYTES;

/** Admin list query: page/pageSize + optional `q` filename search. */
class ListMediaQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @Length(0, 100)
  q?: string;

  /**
   * Whose library to list. Defaults to the caller's own.
   *
   * Declared here and not just read off the query string because the
   * global ValidationPipe runs with `forbidNonWhitelisted: true`
   * (main.ts) — an undeclared parameter is a 400, not an ignored one.
   *
   * `todas` is refused to anyone but a SUPER_ADMIN, in the service.
   */
  @IsOptional()
  @IsIn(['minha', 'todas'])
  scope?: 'minha' | 'todas';

  /**
   * Restrict the list to one kind of file.
   *
   * The picker in the article editor asks for IMAGEM, and it has to be
   * asked of the server rather than filtered afterwards: the picker
   * fetches one page of 200 and stops, so a person with a lot of video
   * would find their images pushed off the end of a list that looks
   * complete.
   *
   * Nothing inserts a video into an article body yet, and a video
   * chosen as a cover image would render as a broken picture.
   */
  @IsOptional()
  @IsIn(['IMAGEM', 'VIDEO'])
  kind?: 'IMAGEM' | 'VIDEO';
}

/**
 * What an upload is for. Absent means the library, which is both the
 * common case and the safe default — a file wrongly in the library can
 * be seen and moved; one wrongly outside it is invisible.
 *
 * Declared because the global ValidationPipe runs with
 * `forbidNonWhitelisted` — an undeclared query param is a 400.
 */
class UploadQueryDto {
  @IsOptional()
  @IsIn(['EDITORIAL', 'PUBLICIDADE'])
  purpose?: 'EDITORIAL' | 'PUBLICIDADE';
}

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
  list(@Query() query: ListMediaQueryDto, @CurrentUser() user: AuthUser) {
    // `media.carregar` says "may use the media library at all"; whose
    // library is the service's decision, from the role.
    return this.service.list(query, { id: user.id, role: user.role });
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
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
    @Query() query: UploadQueryDto,
  ) {
    if (!file) {
      throw new BadRequestException('Ficheiro obrigatório.');
    }
    // Mime/type whitelisting + sharp validation happen inside the
    // service. ParseFilePipeBuilder.addFileTypeValidator was
    // unreliable across Nest versions (regex-vs-magic-byte mismatch),
    // so we keep validation in one place — the service.
    return this.service.uploadFile(file, user.id, query.purpose);
  }

  /**
   * Video upload. Separate from the image route, not a branch inside it.
   *
   * The two differ in the only thing multer decides before our code
   * runs: the size limit. One route with a 100 MB cap would let a
   * hundred-megabyte "image" be buffered into memory before anything
   * looked at it.
   *
   * Everything after that — what the file really is, how long, what
   * codec — is decided in the service, by the bytes.
   */
  @Post('video')
  @RequirePermissions('media.carregar')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_VIDEO_UPLOAD_BYTES } }),
  )
  uploadVideo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Nenhum ficheiro enviado.');
    return this.service.uploadVideo(file, user.id);
  }

  @Delete(':id')
  @RequirePermissions('media.eliminar')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // The role travels with the id: the permission says "may delete
    // media at all", and the service decides whose.
    return this.service.remove(id, { id: user.id, role: user.role });
  }
}
