import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @Length(2, 60)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be kebab-case ASCII' })
  slug?: string;

  @IsString()
  @Length(0, 280)
  description!: string;

  @IsString()
  @Length(1, 4)
  icon!: string;

  @IsString()
  @Matches(/^#[0-9a-fA-F]{3,8}$/, { message: 'color must be a hex string' })
  color!: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}
