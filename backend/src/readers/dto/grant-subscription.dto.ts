import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class GrantSubscriptionDto {
  /**
   * When the gift runs out. Omitted means no end date.
   *
   * Optional rather than required because both cases are real — a
   * columnist gets one open-ended, an apology gets one for a month — but
   * the UI asks for a date first, so "for ever" is a choice somebody
   * makes rather than the shape of an empty form.
   */
  @IsOptional()
  @IsDateString()
  until?: string;

  /** Why. Internal only; the reader never sees this. */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}
