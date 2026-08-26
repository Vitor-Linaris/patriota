import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PageQueryDto } from '../../common/dto/pagination.dto';

/**
 * NOTE: extends PageQueryDto — never `PageQueryDto & {...}`. A TS
 * intersection loses the class-validator metadata and the global
 * ValidationPipe silently stops validating. Same warning as
 * newsletter.controller.ts.
 */
export class LibraryPageQueryDto extends PageQueryDto {}

export class FollowCategoryDto {
  /** Per-category e-mail mute. Following without notifications is valid. */
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}

export class TrackReadDto {
  @IsString()
  articleId!: string;

  /** Scroll depth 0-100. Only ever moves forward. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;
}

export class ArticleStateQueryDto {
  @IsString()
  articleId!: string;
}
