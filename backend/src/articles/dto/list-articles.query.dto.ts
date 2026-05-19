import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PageQueryDto } from '../../common/dto/pagination.dto';

export type ArticleSort = 'publishedAt' | 'views';

export class ListArticlesQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  q?: string;

  /**
   * Comma-separated list of statuses, e.g. "RASCUNHO,AGENDADO".
   * Empty/undefined → no status filter (admin) or only PUBLICADO (public).
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @IsString({ each: true })
  status?: string[];

  /** Order: `publishedAt` (default) or `views` (most-read). */
  @IsOptional()
  @IsIn(['publishedAt', 'views'])
  sort?: ArticleSort;
}
