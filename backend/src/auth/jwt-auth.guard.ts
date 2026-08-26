import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthService, type JwtPayload } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token em falta.');
    }
    const token = auth.slice('Bearer '.length).trim();

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido.');
    }

    // Audience check. Reader tokens are signed with READER_JWT_SECRET so
    // they already fail verifyAsync above — this is the second layer, and
    // the one that still holds if the two secrets are ever unified.
    //
    // Tolerating an ABSENT typ on purpose: staff tokens issued before this
    // shipped (8h lifetime) and test/helpers/auth.ts do not set it. Once
    // AuthService stamps typ:'staff' and one release has passed, tighten
    // this to (payload.typ !== 'staff') — see milestone M10.
    if (payload.typ !== undefined && payload.typ !== 'staff') {
      throw new UnauthorizedException('Token inválido.');
    }

    const user = await this.authService.getUserById(payload.sub);
    if (!user) throw new UnauthorizedException('Utilizador inativo.');

    (req as Request & { user?: typeof user }).user = user;
    return true;
  }
}
