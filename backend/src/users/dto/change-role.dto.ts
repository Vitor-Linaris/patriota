import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ROLE_ORDER, type Role } from '../../rbac/rbac.constants';

export class ChangeRoleDto {
  @IsIn(ROLE_ORDER)
  role!: Role;
}

export class ChangeStatusDto {
  @IsBoolean()
  @IsOptional()
  isActive!: boolean;
}
