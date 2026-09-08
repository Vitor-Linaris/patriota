import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreatePackageDto {
  @IsString()
  @Length(2, 140)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'O slug tem de ser kebab-case ASCII.' })
  @Length(1, 80)
  slug?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  coverImageUrl?: string;

  /**
   * Cents, and the API speaks cents too — the euros↔cents conversion
   * happens once, in the admin form, so this boundary never sees a float.
   *
   * The floor is 100 (€1,00) rather than 0: Stripe takes roughly 2,9% +
   * €0,30 per transaction, so anything under about a euro is mostly fee.
   * A pacote is meant to be a dossier at a real price, not a
   * micropayment — the whole reason bundles work where per-article
   * payments do not. A free pacote is not a pricing decision, it is
   * "oferecer" (see PackagePurchasesService.grant).
   *
   * The ceiling of 100_000 (€1.000,00) is a typo guard, nothing more: it
   * catches somebody typing cents into a field they thought was euros.
   */
  @IsOptional()
  @IsInt()
  @Min(100, { message: 'O preço mínimo é 1,00 €.' })
  @Max(100_000, { message: 'O preço máximo é 1.000,00 €.' })
  priceCents?: number;

  /**
   * Defaults TRUE in the database, and the admin form ships it on. Off is
   * the deliberate choice to sell a pacote apart from the subscription,
   * which inverts assinantes.ler_exclusivos — see package-access.ts.
   */
  @IsOptional()
  @IsBoolean()
  includedInSubscription?: boolean;
}
