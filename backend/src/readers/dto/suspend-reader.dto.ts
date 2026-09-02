import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { SuspensionDuration } from '../../reader-auth/reader-suspension';

export class SuspendReaderDto {
  /**
   * A closed list, not a number of days. The point of the feature is a
   * policy applied evenly; "banido 4000 dias" is a permanent ban that
   * nobody labelled as one, and it would be invisible in any report that
   * counts permanent bans.
   */
  @IsIn(['DIAS_15', 'DIAS_30', 'PERMANENTE'])
  duration!: SuspensionDuration;

  /**
   * Written to be read by the person banned — it is quoted back to them
   * on their next sign-in attempt, so it is not a private note.
   */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;

  /** Also wipe everything they have written. Off unless asked for. */
  @IsOptional()
  @IsBoolean()
  purgeComments?: boolean;
}
