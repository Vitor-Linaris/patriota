import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { PackageStatus } from '../../../generated/prisma/enums';
import { PageQueryDto } from '../../common/dto/pagination.dto';

export class ListPackagesQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  q?: string;

  @IsOptional()
  @IsEnum(PackageStatus)
  status?: PackageStatus;
}
