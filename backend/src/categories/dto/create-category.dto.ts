import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @Length(2, 60)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be kebab-case ASCII' })
  slug?: string;

  @IsString()
  @Length(0, 280)
  description!: string;

  @IsString()
  @Length(1, 4)
  icon!: string;

  @IsString()
  @Matches(/^#[0-9a-fA-F]{3,8}$/, { message: 'color must be a hex string' })
  color!: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  /**
   * Se os leitores são convidados a seguir esta secção por e-mail.
   *
   * Distinto de `visible`, que decide o menu público. Por omissão fica
   * DESLIGADO numa categoria nova: uma secção acabada de criar está
   * quase sempre ainda a ser decidida, e não deve aparecer na lista de
   * toda a gente no instante em que alguém escreveu um nome.
   */
  @IsOptional()
  @IsBoolean()
  followable?: boolean;

  /**
   * Categoria-mãe. Omitir (ou null) cria uma raiz.
   *
   * A profundidade não é validada aqui: a regra é
   * `parent.depth + 1 <= 3`, e a linha da mãe não está ao alcance de um
   * validador de DTO. Fica no serviço, que é também onde tem de ficar a
   * validação de ciclo ao mover.
   */
  @IsOptional()
  @IsString()
  parentId?: string | null;
}
