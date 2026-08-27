import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DigestFrequency } from '../../../generated/prisma/enums';

export class UpdateReaderProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsBoolean()
  displayNamePublic?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyNewArticles?: boolean;

  @IsOptional()
  @IsEnum(DigestFrequency)
  digestFrequency?: DigestFrequency;
}
