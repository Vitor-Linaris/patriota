import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * The one-time code from the OAuth redirect.
 *
 * Note this validates the EXCHANGE body, not the provider's callback
 * query — that one is left unvalidated on purpose, because the global
 * ValidationPipe runs with forbidNonWhitelisted and Google appends
 * authuser/prompt/scope of its own.
 */
export class ExchangeCodeDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  code!: string;
}
