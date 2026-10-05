/**
 * Moves the uploads already on this machine's disk into Cloudflare R2.
 *
 * Two steps, run at different times:
 *
 *  1. `copy` — every file under UPLOADS_DIR goes to the PRIVATE bucket,
 *     and the ones that are already public (a PUBLICO media row, or the
 *     avatar of someone with a published article) are also copied to the
 *     PUBLIC bucket. Nothing in the database changes: the URLs keep
 *     pointing at the API, which from now on reads from R2. Idempotent —
 *     a file already in the bucket with the same size is skipped, so it
 *     can be run again after a failure, or once more right before the
 *     switch to pick up what was uploaded in between.
 *
 *  2. `rewrite-urls` — only once the public bucket has its own domain.
 *     Replaces the old base with the new one in every column that holds
 *     one of our addresses, in ONE transaction. All or nothing on
 *     purpose: the "in use" checks in the admin compare these strings,
 *     and half the rows on the old host and half on the new would make
 *     images that are in use look like orphans.
 *
 * DRY RUN by default, like scripts/sanitize-articles.ts. Nothing is
 * written until `--apply` is passed.
 *
 *   npx ts-node scripts/migrate-uploads-to-r2.ts copy
 *   npx ts-node scripts/migrate-uploads-to-r2.ts copy --apply
 *   npx ts-node scripts/migrate-uploads-to-r2.ts rewrite-urls \
 *     --from=https://api.opatriota.pt/uploads \
 *     --to=https://media.opatriota.pt/uploads [--apply]
 *
 * The files on disk are never deleted. They stay as the backup until the
 * move has been confirmed in production.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { R2StorageDriver } from '../src/storage/r2-storage.driver';
import { StorageService } from '../src/storage/storage.service';

// Same adapter wiring as prisma/seed.ts — Prisma 7 takes the driver
// explicitly rather than reading DATABASE_URL on its own.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const APPLY = process.argv.includes('--apply');
const COMMAND = process.argv[2];

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const trimSlash = (s: string) => s.replace(/\/+$/, '');

function contentTypeFor(rel: string): string {
  if (rel.endsWith('.webp')) return 'image/webp';
  if (rel.endsWith('.mp4')) return 'video/mp4';
  if (rel.endsWith('.webm')) return 'video/webm';
  return 'application/octet-stream';
}

// ─────────────────────────────── copy ───────────────────────────────

function r2FromEnv(): R2StorageDriver {
  const env = {
    endpoint: process.env.R2_ENDPOINT,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    privateBucket: process.env.R2_BUCKET_PRIVATE,
    publicBucket: process.env.R2_BUCKET_PUBLIC,
  };
  const missing = Object.entries(env)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`Faltam variáveis R2: ${missing.join(', ')}`);
  }
  return new R2StorageDriver(env as Record<keyof typeof env, string>);
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** Every file that must also be in the public bucket. */
async function publicSet(base: string): Promise<Set<string>> {
  const rel = (u: string | null) =>
    u && u.startsWith(base + '/')
      ? u.slice(base.length + 1).split(/[?#]/)[0]
      : null;

  const media = await prisma.media.findMany({
    where: { visibility: 'PUBLICO', storageKey: { not: null } },
    select: { url: true, urlMedium: true, urlSmall: true, posterUrl: true },
  });
  const avatars = await prisma.user.findMany({
    where: {
      avatarUrl: { not: null },
      articles: { some: { status: 'PUBLICADO' } },
    },
    select: { avatarUrl: true },
  });

  const set = new Set<string>();
  for (const m of media) {
    for (const u of [m.url, m.urlMedium, m.urlSmall, m.posterUrl]) {
      const r = rel(u);
      if (r) set.add(r);
    }
  }
  for (const a of avatars) {
    const r = rel(a.avatarUrl);
    if (r?.startsWith('avatars/')) set.add(r);
  }
  return set;
}

async function copy() {
  const root = process.env.UPLOADS_DIR ?? '/usr/src/app/uploads';
  const base = trimSlash(
    process.env.UPLOADS_PUBLIC_BASE_URL ?? 'http://localhost:8585/uploads',
  );
  const r2 = r2FromEnv();

  const files = (await walk(root))
    .map((abs) => relative(root, abs).split(sep).join('/'))
    .filter((rel) => StorageService.isSafeRelative(rel));
  const toPublish = await publicSet(base);

  let bytes = 0;
  let uploaded = 0;
  let skipped = 0;
  let published = 0;
  const failed: string[] = [];

  for (const rel of files) {
    const size = (await stat(join(root, rel))).size;
    bytes += size;
    try {
      const inBucket = await r2.head(rel);
      if (inBucket === size) {
        skipped += 1;
      } else {
        if (APPLY) {
          await r2.put(
            rel,
            await readFile(join(root, rel)),
            contentTypeFor(rel),
          );
        }
        uploaded += 1;
      }
      if (toPublish.has(rel)) {
        if (APPLY) await r2.publish([rel]);
        published += 1;
      }
    } catch (e) {
      failed.push(`${rel}: ${(e as Error).message}`);
    }
  }

  const onDisk = new Set(files);
  const missing = [...toPublish].filter((r) => !onDisk.has(r));

  console.log(APPLY ? '\n== copy (APLICADO) ==' : '\n== copy (simulação) ==');
  console.log(
    `Ficheiros em disco:        ${files.length} (${(bytes / 1024 / 1024).toFixed(1)} MB)`,
  );
  console.log(
    `${APPLY ? 'Enviados' : 'A enviar'} para o privado:  ${uploaded}`,
  );
  console.log(`Já no bucket (saltados):   ${skipped}`);
  console.log(
    `${APPLY ? 'Copiados' : 'A copiar'} para o público:  ${published}`,
  );
  if (missing.length > 0) {
    // Public in the database but not on this disk — a broken image today
    // already. Listed so it can be looked at, not invented.
    console.log(`\nPúblicos na BD mas ausentes do disco (${missing.length}):`);
    for (const m of missing) console.log(`  - ${m}`);
  }
  if (failed.length > 0) {
    console.log(
      `\nFalharam (${failed.length}) — correr outra vez retoma daqui:`,
    );
    for (const f of failed) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
  if (!APPLY)
    console.log('\nNada foi escrito. Repita com --apply para enviar.');
}

// ─────────────────────────── rewrite-urls ───────────────────────────

/** [table, column, how the old base appears in it]. */
const COLUMNS: [string, string, 'prefix' | 'anywhere' | 'json'][] = [
  ['Media', 'url', 'prefix'],
  ['Media', 'urlMedium', 'prefix'],
  ['Media', 'urlSmall', 'prefix'],
  ['Media', 'posterUrl', 'prefix'],
  ['Article', 'coverImageUrl', 'prefix'],
  ['Article', 'content', 'anywhere'],
  // A pending edit of a live article, promoted wholesale by publish().
  ['Article', 'draft', 'json'],
  ['Ad', 'imageUrl', 'prefix'],
  ['Package', 'coverImageUrl', 'prefix'],
  ['User', 'avatarUrl', 'prefix'],
];

async function rewriteUrls() {
  const from = arg('from');
  const to = arg('to');
  if (!from || !to) {
    throw new Error('Use --from=<base antiga> --to=<base nova>');
  }
  const oldBase = trimSlash(from);
  const newBase = trimSlash(to);

  // position() rather than LIKE: a URL may contain `_`, which LIKE
  // would read as a wildcard.
  const where = (col: string, how: 'prefix' | 'anywhere' | 'json') =>
    how === 'prefix'
      ? `position($1 in "${col}") = 1`
      : how === 'json'
        ? `position($1 in "${col}"::text) > 0`
        : `position($1 in "${col}") > 0`;
  const set = (col: string, how: 'prefix' | 'anywhere' | 'json') =>
    how === 'json'
      ? `"${col}" = replace("${col}"::text, $1, $2)::jsonb`
      : `"${col}" = replace("${col}", $1, $2)`;

  console.log(
    APPLY
      ? '\n== rewrite-urls (APLICADO) =='
      : '\n== rewrite-urls (simulação) ==',
  );
  console.log(`${oldBase}  →  ${newBase}\n`);

  await prisma.$transaction(async (tx) => {
    for (const [table, col, how] of COLUMNS) {
      const [{ n }] = await tx.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${table}" WHERE ${where(col, how)}`,
        oldBase,
      );
      console.log(`${`${table}.${col}`.padEnd(24)} ${n} linha(s)`);
      if (APPLY && n > 0n) {
        await tx.$executeRawUnsafe(
          `UPDATE "${table}" SET ${set(col, how)} WHERE ${where(col, how)}`,
          oldBase,
          newBase,
        );
      }
    }
  });

  if (!APPLY)
    console.log('\nNada foi escrito. Repita com --apply para gravar.');
}

async function main() {
  if (COMMAND === 'copy') await copy();
  else if (COMMAND === 'rewrite-urls') await rewriteUrls();
  else {
    console.log('Uso: migrate-uploads-to-r2.ts copy|rewrite-urls [--apply]');
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
