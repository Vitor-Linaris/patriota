import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { Role } from '../rbac/rbac.constants';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  /**
   * Audience marker separating staff tokens from reader tokens
   * (src/reader-auth/). Required as of M10: JwtAuthGuard refuses a token
   * without it, so the two audiences cannot be confused even if the
   * separate signing secrets were ever unified.
   */
  typ: 'staff';
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{
    accessToken: string;
    user: AuthUser;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    // Run bcrypt even if the user does not exist to keep timing constant
    const hash =
      user?.password ??
      '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
    const valid = await bcrypt.compare(password, hash);

    if (!user || !user.isActive || !valid) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      // Audience marker. JwtAuthGuard now REQUIRES it, so a reader token
      // can never satisfy a staff route even if the two signing secrets
      // were ever unified by accident.
      typ: 'staff',
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async getUserById(id: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}
