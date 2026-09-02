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

  /**
   * The raw column. Matches a reader whose subscription ended but whose
   * row has not been tidied yet — use `active` for "is a subscriber
   * today", which is what the dashboard counts.
   */
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

  /**
   * Subscribers as of right now, by date.
   *
   * The three below exist so the dashboard's figures are clickable and
   * land on EXACTLY the rows that were counted. They share their window
   * constants with getStats() for that reason — a card saying 12 that
   * opens a list of 15 is worse than no link at all.
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  active?: string;

  /** Subscriptions that STARTED inside the recent window. */
  @IsOptional()
  @IsIn(['true', 'false'])
  newPlans?: string;

  /**
   * Gifts running out soon — the list to send a "renova?" mail to.
   *
   * Given subscriptions only, matching the dashboard card. A Stripe
   * subscription renewing in five days needs nobody; a gift ending in
   * five days is the whole point of this filter.
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  expiring?: string;

  /**
   * Who cancelled inside the window — the churn list.
   *
   * By the day they cancelled, not the day their access stops: those are
   * different dates, and it is the first one the newsroom can still act
   * on.
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  cancelled?: string;

  /**
   * How far back `cancelled` looks: 30 days, 6 months or a year.
   *
   * A closed set rather than any number — it is a scan over a column an
   * anonymous-ish query could otherwise point at the whole table. An
   * unrecognised value falls back to 30 rather than failing, so a stale
   * bookmark still shows something sensible.
   */
  @IsOptional()
  @IsIn(['30', '180', '365'])
  cancelledDays?: string;

  /** Cancelled but still reading — the paid period has not run out. */
  @IsOptional()
  @IsIn(['true', 'false'])
  inGrace?: string;
}
