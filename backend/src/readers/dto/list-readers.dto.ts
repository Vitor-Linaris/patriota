import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../common/dto/pagination.dto';
import { ReaderPlan, ReaderStatus } from '../../../generated/prisma/enums';

/** NOTE: extends PageQueryDto. An intersection would drop the validators. */
export class ListReadersQueryDto extends PageQueryDto {
  /** Partial name or e-mail, case-insensitive. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsEnum(ReaderPlan)
  plan?: ReaderPlan;

  @IsOptional()
  @IsEnum(ReaderStatus)
  status?: ReaderStatus;

  /**
   * "Who is banned right now" — which is NOT `status=SUSPENSO`. That one
   * still matches a reader whose ban ended last week, because the column
   * is only tidied when a checkpoint next sees the row. This filter asks
   * the date, the way isSuspended() does.
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  suspended?: string;
}
