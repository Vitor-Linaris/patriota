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

/**
 * Ceiling on the RAW body, before tags come off.
 *
 * Deliberately far above the real 280-character limit in
 * comments.service.ts, and not the same check. This one only stops a
 * megabyte of paste from reaching the sanitiser; the limit the reader is
 * held to is measured on the stripped text, so markup they never typed
 * does not count against them. Matching the two numbers here would
 * quietly reintroduce that.
 */
const MAX_RAW_BODY = 4000;

export class CreateCommentDto {
  /** Plain text. The service strips tags and applies the real bound. */
  @IsString()
  @Length(2, MAX_RAW_BODY, {
    message: 'O comentário é demasiado longo.',
  })
  body!: string;

  /** Replying to a reply re-parents onto the root — threads stay 2 deep. */
  @IsOptional()
  @IsString()
  parentId?: string;
}

export class UpdateCommentDto {
  @IsString()
  @Length(2, MAX_RAW_BODY, {
    message: 'O comentário é demasiado longo.',
  })
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

/**
 * The reason is required here, unlike ModerateCommentDto.note — it is
 * both stored on the row and mailed to the comment's author, so an admin
 * cannot remove a comment silently the way approving one is allowed to be.
 */
export class DeleteCommentDto {
  @IsString()
  @Length(3, 280, {
    message: 'Escreva um motivo com pelo menos 3 caracteres.',
  })
  reason!: string;
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
