import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UnsubscribeQueryDto {
  @IsString()
  @MaxLength(200)
  t!: string;

  /** Category SLUG from the e-mail footer link. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoria?: string;
}

export class UnsubscribeDto {
  @IsString()
  @MaxLength(200)
  token!: string;

  /** Category ID. Omit (or pass all) to stop every notification e-mail. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  all?: boolean;
}
