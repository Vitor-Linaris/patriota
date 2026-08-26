import { IsString, MaxLength, MinLength } from 'class-validator';

/** Email-verification link payload. */
export class VerifyEmailDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  @IsString()
  @MinLength(10, { message: 'A palavra-passe deve ter pelo menos 10 caracteres.' })
  @MaxLength(200)
  password!: string;
}
