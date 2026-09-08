import { ArrayMaxSize, IsArray, IsString, Length } from 'class-validator';

/**
 * The whole ordered membership, sent as one array.
 *
 * A PUT of the entire list rather than add/remove endpoints: the editor
 * reorders and removes in the same pass, and replaying a partial sequence
 * out of order would leave positions that disagree with the screen.
 * Idempotent by construction.
 *
 * The array is the CURRENT contents of the pacote and nothing more.
 * Nobody's purchase snapshot is rewritten from here — see
 * PackagePurchase.snapshotArticleIds.
 */
export class SetPackageArticlesDto {
  @IsArray()
  /**
   * 100 is a limit on the editor's ambition, not on the schema. It also
   * matches PageQueryDto's @Max(100), so a pacote can always be listed in
   * one page, and it keeps the purchase snapshot a sane size.
   */
  @ArrayMaxSize(100, { message: 'Um pacote não pode ter mais de 100 artigos.' })
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  articleIds!: string[];
}
