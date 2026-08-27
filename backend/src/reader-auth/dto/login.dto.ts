import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ReaderLoginDto {
  @IsEmail({}, { message: 'E-mail inválido.' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Palavra-passe obrigatória.' })
  @MaxLength(200)
  password!: string;
}
