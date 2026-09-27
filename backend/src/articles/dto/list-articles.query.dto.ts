import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PageQueryDto } from '../../common/dto/pagination.dto';

export type ArticleSort = 'publishedAt' | 'views' | 'comments';

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

  /**
   * Order: `publishedAt` (default), `views` (most-read) or `comments`
   * (most-commented — Article.commentCount, which only ever counts
   * APROVADO comments; see CommentsService.recount).
   */
  @IsOptional()
  @IsIn(['publishedAt', 'views', 'comments'])
  sort?: ArticleSort;

  /**
   * Admin only, and OFF by default: widen ?category to the whole subtree.
   *
   * The public site funnels automatically — opening "Portugal" shows the
   * Funchal too. The CMS deliberately does not: an editor filtering by
   * "Portugal" to find a specific piece means literally Portugal, and
   * silently mixing in four levels of children would make the list
   * unusable for the job it exists to do.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  includeDescendants?: boolean;
}
