import { IsOptional, IsString, Length, ValidateIf } from 'class-validator';

/**
 * File one article into one pacote, from the article editor.
 *
 * The reverse direction of the multi-select in /admin/pacotes, and the
 * half the newsroom actually lives in: a journalist writing a piece for a
 * dossier picks the pacote there and never opens the pacote screen.
 *
 * `packageId: null` takes the article out of whatever pacote it is in.
 * Declared with ValidateIf so an explicit null passes the global
 * ValidationPipe, which would otherwise reject it as not-a-string.
 */
export class AssignArticleDto {
  @IsString()
  @Length(1, 40)
  articleId!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(1, 40)
  packageId!: string | null;
}
