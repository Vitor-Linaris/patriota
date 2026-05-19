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
  Length,
  Matches,
  Max,
  Min,
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

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
