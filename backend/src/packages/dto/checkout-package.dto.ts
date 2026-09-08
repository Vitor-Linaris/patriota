import { IsString, Length, Matches } from 'class-validator';

/**
 * The slug travels in the BODY, not the path, and that is deliberate.
 *
 * The frontend BFF handler (app/api/conta/pacotes/checkout) must forward
 * to a path it holds as a constant, with nothing interpolated into it —
 * the rule stated in app/api/conta/_forward.ts, because a handler that
 * builds a path from input and attaches a reader bearer token is one
 * missing prefix check away from replaying that token against /admin/*.
 *
 * Note what is NOT here: any amount. The price comes from the Package row
 * and the charged total comes back from Stripe. A client that could name
 * a price would be a client that could name zero.
 */
export class CheckoutPackageDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'Pacote inválido.' })
  @Length(1, 80)
  slug!: string;
}
