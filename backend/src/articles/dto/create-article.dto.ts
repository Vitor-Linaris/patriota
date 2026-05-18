import { ArticleStatus } from '../../../generated/prisma/enums';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

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

  @IsOptional()
  @IsBoolean()
  premium?: boolean;

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
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
