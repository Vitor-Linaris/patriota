import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { Role } from '../rbac/rbac.constants';

/** Same cost every stored staff password uses (users.service.ts). */
const BCRYPT_ROUNDS = 12;

/**
 * Compared against when the e-mail matches no staff account, so that the
 * "no such user" branch costs the same as the real one and response time
 * does not disclose which addresses are newsroom accounts.
 *
 * DERIVED at module load, never a literal. bcryptjs returns false from
 * compare() on the next tick for any hash that is not exactly 60
 * characters, performing no key derivation at all — so a hand-written
 * placeholder of the wrong length silently disables this. The literal
 * that used to sit here was 65 characters AND declared cost 10 against
 * the cost 12 of every real hash, so both halves of the equalisation
 * were wrong. Deriving it fixes the length by construction and keeps the
 * cost tied to BCRYPT_ROUNDS.
 */
const ABSENT_USER_HASH = bcrypt.hashSync(
  randomBytes(32).toString('hex'),
  BCRYPT_ROUNDS,
);

/* istanbul ignore next -- boot-time invariant, not a runtime branch */
if (ABSENT_USER_HASH.length !== 60) {
  throw new Error(
    'ABSENT_USER_HASH tem de ser um hash bcrypt de 60 caracteres, ou o ' +
      'bcrypt.compare() curto-circuita e o login de staff passa a ' +
      'revelar, pelo tempo de resposta, que endereços são contas.',
  );
}

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
    const hash = user?.password ?? ABSENT_USER_HASH;
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
