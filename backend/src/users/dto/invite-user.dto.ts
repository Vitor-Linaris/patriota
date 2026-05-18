import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { ROLE_ORDER, type Role } from '../../rbac/rbac.constants';

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @IsIn(ROLE_ORDER)
  role!: Role;
}
