import { IsOptional, IsString, Length } from 'class-validator';
import { PageQueryDto } from '../../common/dto/pagination.dto';

/**
 * Admin list query for users. Inherits page/pageSize from the shared
 * PageQueryDto and adds a free-text search across name + email.
 */
export class ListUsersQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @Length(0, 100)
  q?: string;
}
