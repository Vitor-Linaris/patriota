import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Um aviso registado sem suspender.
 *
 * A razão é opcional, como na suspensão: obrigar a escrever qualquer
 * coisa produz "spam" e "idem", que não dizem mais do que o facto de
 * haver um registo. O que conta é ficar lá.
 */
export class WarnReaderDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}
