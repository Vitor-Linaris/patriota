import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { Role } from '../../src/rbac/rbac.constants';
import * as bcrypt from 'bcryptjs';

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  token: string;
}

/**
 * Creates (or upserts) a user with the given role and returns a valid JWT.
 * Uses the same JwtService instance as the running app so tokens verify.
 */
export async function makeUser(
  app: INestApplication,
  overrides: Partial<{ email: string; name: string; role: Role; password: string }> = {},
): Promise<TestUser> {
  const prisma = app.get(PrismaService);
  const jwt = app.get(JwtService);

  const email = (overrides.email ?? `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`).toLowerCase();
  const name = overrides.name ?? 'Test User';
  const role: Role = overrides.role ?? 'SUPER_ADMIN';
  const password = overrides.password ?? 'TestPassword123!';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { role, isActive: true, name, password: passwordHash },
    create: { email, name, role, isActive: true, password: passwordHash },
  });

  // Must mirror AuthService.login exactly, including typ — JwtAuthGuard
  // requires it, so an unstamped test token would 401 everywhere.
  const token = await jwt.signAsync({
    sub: user.id,
    email: user.email,
    role,
    typ: 'staff',
  });
  return { id: user.id, email: user.email, name, role, token };
}

/** Authorization header value for a given test user. */
export function bearer(user: TestUser): { Authorization: string } {
  return { Authorization: `Bearer ${user.token}` };
}
