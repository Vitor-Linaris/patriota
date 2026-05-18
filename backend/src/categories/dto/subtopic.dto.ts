import { IsInt, IsOptional, IsString, Length } from 'class-validator';

export class CreateSubtopicDto {
  @IsString()
  @Length(1, 60)
  label!: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
