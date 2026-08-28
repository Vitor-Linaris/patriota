import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Truncates the tables passed in (in order) using TRUNCATE ... CASCADE.
 * Safe to call between test cases for isolation.
 *
 * CASCADE also empties every table that REFERENCES the ones listed, which
 * now reaches further than it used to. Since the reader area landed:
 *   • truncating "User"     also empties "Comment" (via moderatedById)
 *   • truncating "Article"  also empties "Comment", "ArticleFavorite",
 *                           "ReadingHistory" and "ArticleNotification"
 *   • truncating "Reader"   empties all of the reader-owned tables
 *   • truncating "Category" also empties "CategoryFavorite" and every
 *                           child Category (parentId is self-referencing,
 *                           onDelete: Restrict — but CASCADE on TRUNCATE
 *                           still empties referencing rows regardless of
 *                           the FK's onDelete action)
 * Harmless for isolation — but if a spec truncates "Article" and then
 * expects its own seeded comments to survive, this is why they did not.
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
