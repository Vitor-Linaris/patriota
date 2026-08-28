import { IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

/**
 * A SINGLE move, not the whole tree.
 *
 * Sending the entire tree on every drop would make the last editor to
 * drop win over a colleague's concurrent edit, silently. One move is also
 * the only payload that says what actually happened, rather than what the
 * tree happened to look like afterwards.
 */
export class ReorderCategoryDto {
  @IsString()
  id!: string;

  /**
   * Destination parent; null moves the node to the root.
   *
   * @ValidateIf rather than @IsOptional: null is a MEANINGFUL value here
   * (promote to root), so it must pass validation while a missing key
   * still fails. @IsOptional() would skip validation for both.
   */
  @ValidateIf((_, value) => value !== null)
  @IsString()
  parentId!: string | null;

  /** Position among the destination's children, clamped server-side. */
  @IsOptional()
  @IsInt()
  @Min(0)
  index?: number;
}
