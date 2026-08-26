import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface TestReader {
  id: string;
  email: string;
  name: string;
  token: string;
}

/**
 * Mirror of makeUser() for the public audience.
 *
 * Deliberately signs with READER_JWT_SECRET and stamps typ:'reader', so a
 * token minted here is exactly what the real login issues — including
 * being unusable against any staff route. Tests that want to prove the
 * isolation should compare against makeUser()'s token, which is signed
 * with the other key.
 */
export async function makeReader(
  app: INestApplication,
  overrides: Partial<{
    email: string;
    name: string;
    password: string | null;
    verified: boolean;
    status: 'PENDENTE_VERIFICACAO' | 'ATIVO' | 'SUSPENSO' | 'ANONIMIZADO';
  }> = {},
): Promise<TestReader> {
  const prisma = app.get(PrismaService);
  const jwt = app.get(JwtService);
  const config = app.get(ConfigService);

  const email = (
    overrides.email ??
    `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
  ).toLowerCase();
  const name = overrides.name ?? 'Test Reader';
  const verified = overrides.verified ?? true;
  const status = overrides.status ?? 'ATIVO';

  // `null` means a social-only account; undefined means "give it one".
  const rawPassword =
    overrides.password === null ? null : (overrides.password ?? 'TestReader123!');
  const password = rawPassword === null ? null : await bcrypt.hash(rawPassword, 10);

  const reader = await prisma.reader.upsert({
    where: { email },
    update: {
      name,
      password,
      status,
      emailVerifiedAt: verified ? new Date() : null,
    },
    create: {
      email,
      name,
      password,
      status,
      emailVerifiedAt: verified ? new Date() : null,
      unsubscribeToken: randomBytes(32).toString('base64url'),
    },
  });

  const token = await jwt.signAsync(
    { sub: reader.id, typ: 'reader', tv: reader.tokenVersion },
    { secret: config.get<string>('READER_JWT_SECRET')! },
  );

  return { id: reader.id, email: reader.email, name, token };
}

/** Authorization header value for a given test reader. */
export function readerBearer(reader: TestReader): { Authorization: string } {
  return { Authorization: `Bearer ${reader.token}` };
}
