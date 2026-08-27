import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { PageQueryDto } from '../../common/dto/pagination.dto';
import { CommentStatus } from '../../../generated/prisma/enums';

export class CreateCommentDto {
  /**
   * Plain text. The service strips tags again on write; this bound is the
   * first line of defence, not the only one.
   */
  @IsString()
  @Length(2, 2000, { message: 'O comentário deve ter entre 2 e 2000 caracteres.' })
  body!: string;

  /** Replying to a reply re-parents onto the root — threads stay 2 deep. */
  @IsOptional()
  @IsString()
  parentId?: string;
}

export class UpdateCommentDto {
  @IsString()
  @Length(2, 2000, { message: 'O comentário deve ter entre 2 e 2000 caracteres.' })
  body!: string;
}

/** NOTE: extends PageQueryDto. An intersection would drop the validators. */
export class ListCommentsQueryDto extends PageQueryDto {}

export class ListMyCommentsQueryDto extends PageQueryDto {
  /** Window in days, e.g. "30" or "90". Anything else is ignored. */
  @IsOptional()
  @IsString()
  @MaxLength(4)
  since?: string;
}

export class ModerationQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(CommentStatus)
  status?: CommentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class ModerateCommentDto {
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}

export class BulkModerateDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];

  @IsEnum(CommentStatus)
  status!: CommentStatus;
}
