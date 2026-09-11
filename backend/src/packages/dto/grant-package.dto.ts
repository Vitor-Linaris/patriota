import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Comping a pacote: access with no payment.
 *
 * The pacote equivalent of leitores.oferecer_assinatura, and gated the
 * same way — it gives away the product, so it is off EDITOR by default.
 *
 * It is also what makes the entire entitlement path testable on a
 * deployment with no Stripe keys, but that is a happy side effect, not the
 * reason it exists.
 */
export class GrantPackageDto {
  @IsString()
  @Length(1, 40)
  readerId!: string;

  @IsString()
  @Length(1, 40)
  packageId!: string;

  /** Why it was given. Shows up beside the grant in the purchases list. */
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}
