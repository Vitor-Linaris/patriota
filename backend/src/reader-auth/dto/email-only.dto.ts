import { IsEmail, MaxLength } from 'class-validator';

/** Shared by resend-verification and forgot-password. */
export class EmailOnlyDto {
  @IsEmail({}, { message: 'E-mail inválido.' })
  @MaxLength(254)
  email!: string;
}
