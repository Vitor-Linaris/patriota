import { ArticleStatus } from '../../../generated/prisma/enums';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ContextColumnDto {
  @IsString()
  @Length(1, 60)
  label!: string;

  @IsString()
  @Length(1, 280)
  body!: string;
}

export class ArticleContextDto {
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ContextColumnDto)
  columns!: ContextColumnDto[];
}

export class ArticlePullQuoteDto {
  @IsString()
  @Length(1, 500)
  quote!: string;

  @IsString()
  @Length(1, 120)
  cite!: string;
}

export class CreateArticleDto {
  @IsString()
  @Length(2, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be kebab-case ASCII' })
  slug?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  summary?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  /** Requires a paid subscription to read. Shown as "Conteúdo Exclusivo". */
  @IsOptional()
  @IsBoolean()
  exclusive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  readMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @Length(1, 200, { each: true })
  essentials?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ArticleContextDto)
  context?: ArticleContextDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ArticlePullQuoteDto)
  pullQuote?: ArticlePullQuoteDto;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  /**
   * A partner's video page or a direct file URL, embedded below the cover
   * image. See VideoEmbed.tsx on the frontend for how the URL shape is
   * turned into a player — this only checks that it IS a URL.
   *
   * @ValidateIf, not @IsOptional() alone: that only skips validation for
   * null/undefined, not "" — and "" is exactly what clearing the field
   * sends. @IsUrl() would otherwise refuse the very request that clears
   * it, the same way coverImageUrl is allowed to clear to "".
   */
  @IsOptional()
  @ValidateIf((o: CreateArticleDto) => !!o.videoEmbedUrl)
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Introduza um URL de vídeo válido (http:// ou https://).' },
  )
  @Length(0, 2000)
  videoEmbedUrl?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
