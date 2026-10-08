import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { clientIpOf } from '../common/bff-throttler.guard';
import { AuthService, type AuthUser } from './auth.service';
import { RbacService } from '../rbac/rbac.service';
import { ASSIGNABLE_ROLES } from '../rbac/rbac.constants';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly rbac: RbacService,
  ) {}

  @Public()
  @Post('login')
  // Strict rate limit on login to deter credential-stuffing: 5 / minute / IP.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, clientIpOf(req));
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const permissions = await this.rbac.getPermissionsForRole(user.role);
    // Roles this user is allowed to assign to others — drives the UI's
    // role pickers so a COLUNISTA never sees a SUPER_ADMIN option.
    const assignableRoles = ASSIGNABLE_ROLES[user.role] ?? [];
    return { ...user, permissions, assignableRoles };
  }
}
