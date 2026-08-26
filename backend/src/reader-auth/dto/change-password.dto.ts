import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Palavra-passe atual obrigatória.' })
  @MaxLength(200)
  current!: string;

  @IsString()
  @MinLength(10, { message: 'A palavra-passe deve ter pelo menos 10 caracteres.' })
  @MaxLength(200)
  next!: string;
}
