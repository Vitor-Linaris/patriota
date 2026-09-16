import {
  IsObject,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** Trims before validating, so "   " cannot pass a MinLength check. */
const trimmed = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/**
 * The staff profile, edited by its owner.
 *
 * `name` and `bio` are REQUIRED as of this release, at the newsroom's
 * request. Both are published material: the name signs the article and
 * the bio is what a reader sees under it, so a byline with neither is a
 * piece nobody is accountable for.
 *
 * Still `@IsOptional()` on the DTO, and enforced in the service instead.
 * The reason is that this endpoint is a PATCH used by more than one
 * form — the avatar upload and the notification toggles both come
 * through here with nothing else in the body — and making the fields
 * mandatory at the DTO level would make those calls 400 for not
 * resending a name nobody was editing. The service applies the rule to
 * the value that would actually be STORED, which is where it belongs.
 */
export class UpdateOwnDto {
  @IsOptional()
  @trimmed()
  @IsString()
  @Length(2, 80)
  name?: string;

  @IsOptional()
  @trimmed()
  @IsString()
  @MinLength(1)
  @Length(1, 500)
  bio?: string;

  @IsOptional()
  @trimmed()
  @IsString()
  @Length(0, 40)
  phone?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  /**
   * One of the labels configured in /admin/configuracoes › Redacção.
   *
   * Not validated by a decorator: the valid set is a Setting row the
   * newsroom edits, so the check has to read it at request time. See
   * UsersService.updateOwn.
   */
  @IsOptional()
  @trimmed()
  @IsString()
  @Length(0, 80)
  publishingCadence?: string;

  @IsOptional()
  @IsObject()
  notificationPrefs?: Record<string, boolean>;
}
