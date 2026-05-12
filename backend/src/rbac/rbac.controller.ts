import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import { RbacService } from './rbac.service';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { ROLE_ORDER, type Role } from './rbac.constants';

@Controller('admin/rbac')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('matrix')
  @RequirePermissions('configuracoes.permissoes')
  getMatrix() {
    return this.rbac.getMatrix();
  }

  @Put('role/:role')
  @Roles('SUPER_ADMIN')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  update(
    @Param('role') role: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    if (!ROLE_ORDER.includes(role as Role)) {
      throw new BadRequestException(`Role desconhecida: ${role}`);
    }
    return this.rbac.updateRolePermissions(role as Role, dto.permissions);
  }
}
