import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { PageQueryDto } from '../common/dto/pagination.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateOwnDto } from './dto/update-own.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeRoleDto, ChangeStatusDto } from './dto/change-role.dto';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // ── Admin ─────────────────────────────────────────────────────────
  @Get('admin/users')
  @RequirePermissions('utilizadores.ver')
  list(@Query() query: PageQueryDto) {
    return this.users.list(query);
  }

  @Post('admin/users')
  @RequirePermissions('utilizadores.criar')
  invite(@Body() dto: InviteUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.invite(dto, { id: actor.id, role: actor.role });
  }

  @Patch('admin/users/:id/role')
  @RequirePermissions('utilizadores.atribuir_roles')
  changeRole(
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.changeRole(id, dto.role, { id: actor.id, role: actor.role });
  }

  @Patch('admin/users/:id/status')
  @RequirePermissions('utilizadores.suspender')
  setActive(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.setActive(id, dto.isActive, { id: actor.id, role: actor.role });
  }

  @Post('admin/users/:id/reset-password')
  @RequirePermissions('utilizadores.resetar_password')
  resetPassword(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.users.resetPassword(id, {
      id: actor.id,
      role: actor.role,
    });
  }

  @Delete('admin/users/:id')
  @RequirePermissions('utilizadores.eliminar')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.users.remove(id, { id: actor.id, role: actor.role });
  }

  // ── Self-service (authenticated) ──────────────────────────────────
  @Get('users/me/profile')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getOwn(user.id);
  }

  @Patch('users/me')
  updateMe(@Body() dto: UpdateOwnDto, @CurrentUser() user: AuthUser) {
    return this.users.updateOwn(user.id, dto);
  }

  @Post('users/me/password')
  changeMyPassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.changeOwnPassword(user.id, dto);
  }
}
