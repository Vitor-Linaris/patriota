import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Truncates the tables passed in (in order) using TRUNCATE ... CASCADE.
 * Safe to call between test cases for isolation.
 */
export async function truncate(
  app: INestApplication,
  tables: string[],
): Promise<void> {
  const prisma = app.get(PrismaService);
  // Quote the identifiers so case-sensitive Postgres tables (e.g. "User") work.
  const list = tables.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
