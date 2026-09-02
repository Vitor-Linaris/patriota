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
import {
  PLAN_ORDER,
  ROLE_ORDER,
  type ReaderPlan,
  type Role,
} from './rbac.constants';

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

  /**
   * What a subscription buys.
   *
   * SUPER_ADMIN only, same as the role matrix: this decides the shape of
   * the paid product, not just who in the newsroom may click what.
   */
  @Put('plan/:plan')
  @Roles('SUPER_ADMIN')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  updatePlan(
    @Param('plan') plan: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    if (!PLAN_ORDER.includes(plan as ReaderPlan)) {
      throw new BadRequestException(`Plano desconhecido: ${plan}`);
    }
    return this.rbac.updatePlanPermissions(plan as ReaderPlan, dto.permissions);
  }
}
