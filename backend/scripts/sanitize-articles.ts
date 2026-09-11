/**
 * Bring existing article bodies in line with the sanitiser.
 *
 * Sanitising on write protects everything from now on and nothing that is
 * already in the database — and on a news site the archive is read for
 * years, so "it will be clean once somebody re-edits it" means "never".
 *
 * Runs as a DRY RUN by default and prints what it WOULD change: which
 * articles, how many bytes move, and which tags or attributes come out.
 * Nothing is written until `--apply` is passed. That order is the point —
 * the risk of this change was never the script, it was discovering after
 * the fact that the allowlist was too tight for some old piece.
 *
 *   npx ts-node scripts/sanitize-articles.ts          # relatório
 *   npx ts-node scripts/sanitize-articles.ts --apply  # grava
 *
 * `draft` is included: it is promoted into the live columns wholesale by
 * publish(), so a parked edit is a delayed way in.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { sanitizeArticleContent } from '../src/articles/sanitize-content';

// Same adapter wiring as prisma/seed.ts — Prisma 7 takes the driver
// explicitly rather than reading DATABASE_URL on its own.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const APPLY = process.argv.includes('--apply');

/** Which tags/attributes disappeared, so the report says WHY it changed. */
function whatChanged(before: string, after: string): string[] {
  const notes: string[] = [];
  const tags = (html: string) =>
    new Set([...html.matchAll(/<([a-z][a-z0-9]*)\b/gi)].map((m) => m[1]!.toLowerCase()));
  const lost = [...tags(before)].filter((t) => !tags(after).has(t));
  if (lost.length) notes.push(`tags removidas: ${lost.join(', ')}`);
  for (const attr of ['onerror', 'onclick', 'onload', 'onmouseover', 'style', 'class']) {
    const re = new RegExp(`\\b${attr}=`, 'i');
    if (re.test(before) && !re.test(after)) notes.push(`atributo removido: ${attr}`);
  }
  if (/javascript:/i.test(before) && !/javascript:/i.test(after)) {
    notes.push('URL javascript: removido');
  }
  if (notes.length === 0) notes.push('apenas normalização de markup');
  return notes;
}

async function main() {
  const articles = await prisma.article.findMany({
    select: { id: true, slug: true, title: true, content: true, draft: true },
    orderBy: { createdAt: 'asc' },
  });

  let changed = 0;
  let draftsChanged = 0;

  for (const a of articles) {
    const cleanContent = sanitizeArticleContent(a.content);
    const contentDiffers = cleanContent !== a.content;

    const draft = (a.draft ?? null) as Record<string, unknown> | null;
    const draftContent =
      draft && typeof draft.content === 'string' ? draft.content : null;
    const cleanDraft = draftContent === null ? null : sanitizeArticleContent(draftContent);
    const draftDiffers = draftContent !== null && cleanDraft !== draftContent;

    if (!contentDiffers && !draftDiffers) continue;

    if (contentDiffers) {
      changed++;
      console.log(
        `\n[${a.slug}] ${a.title}\n` +
          `  corpo: ${a.content.length} → ${cleanContent.length} caracteres\n` +
          `  ${whatChanged(a.content, cleanContent).join('\n  ')}`,
      );
    }
    if (draftDiffers) {
      draftsChanged++;
      console.log(
        `\n[${a.slug}] ${a.title} (RASCUNHO por promover)\n` +
          `  ${whatChanged(draftContent!, cleanDraft!).join('\n  ')}`,
      );
    }

    if (APPLY) {
      await prisma.article.update({
        where: { id: a.id },
        data: {
          ...(contentDiffers ? { content: cleanContent } : {}),
          ...(draftDiffers
            ? { draft: { ...draft, content: cleanDraft } as never }
            : {}),
        },
      });
    }
  }

  console.log(
    `\n${'─'.repeat(60)}\n` +
      `${articles.length} artigos analisados.\n` +
      `${changed} corpos e ${draftsChanged} rascunhos ${
        APPLY ? 'ALTERADOS' : 'seriam alterados'
      }.\n` +
      (APPLY
        ? 'Gravado.'
        : 'Nada foi gravado. Corra outra vez com --apply para gravar.'),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
