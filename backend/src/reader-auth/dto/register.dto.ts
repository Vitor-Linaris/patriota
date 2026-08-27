import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'E-mail inválido.' })
  @MaxLength(254)
  email!: string;

  /**
   * 10 is deliberately above the 8 most sites use: these accounts are
   * never rate-limited by a corporate SSO and the readership reuses
   * passwords. No composition rules — length beats character classes.
   */
  @IsString()
  @MinLength(10, { message: 'A palavra-passe deve ter pelo menos 10 caracteres.' })
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}
