import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import {
  PageQueryDto,
  PageResult,
  toSkipTake,
} from '../common/dto/pagination.dto';
import type { Role } from '../rbac/rbac.constants';

export interface CreateMediaInput {
  url: string;
  name?: string;
  width?: number;
  height?: number;
  size?: number;
  mimeType?: string;
}

/**
 * Who is asking. The library is per-person, so every read and write
 * needs the role as well as the id.
 */
export interface MediaActor {
  id: string;
  role: Role;
}

/**
 * Whether this person may see past their own library.
 *
 * SUPER_ADMIN alone, and deliberately narrow. Somebody has to be able
 * to clear out the files of staff who have left and to answer "where
 * did that photo go" — but a library that everyone can rummage through
 * is the shared library this feature exists to replace.
 */
export function canReachAll(actor: MediaActor): boolean {
  return actor.role === 'SUPER_ADMIN';
}

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const SUPPORTED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/tiff',
  'image/avif',
]);

interface SizeSpec {
  key: 'small' | 'medium' | 'large';
  width: number;
}

/** Read the size widths from env at boot. Defaults match the plan. */
/** Drop the trailing file extension (`.png`, `.JPEG`, etc.). Returns
 *  the input unchanged if no extension is found. */
function stripExtension(name: string | undefined | null): string {
  if (!name) return '';
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

/**
 * Every storage key mentioned in a blob of text.
 *
 * Matches the shape our own uploads produce — `YYYY/MM/<hex>-large.webp`
 * and its two siblings — and returns the key without the suffix, which
 * is what identifies the whole set of three.
 *
 * Deliberately pattern-matching rather than parsing HTML: an inline
 * image can be in an `src`, a `srcset`, a `style` background, or inside
 * something a future editor produces. The address is the address
 * wherever it appears, and missing one means an image that 404s on a
 * live page.
 */
const STORAGE_KEY_IN_TEXT =
  /(\d{4}\/\d{2}\/[0-9a-f]{8,})-(?:large|medium|small)\.webp/g;

export function extractStorageKeys(...texts: (string | null | undefined)[]) {
  const keys = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(STORAGE_KEY_IN_TEXT)) keys.add(m[1]!);
  }
  return [...keys];
}

function loadSizes(): SizeSpec[] {
  return [
    { key: 'small', width: Number(process.env.IMAGE_SIZE_SMALL ?? 400) },
    { key: 'medium', width: Number(process.env.IMAGE_SIZE_MEDIUM ?? 800) },
    { key: 'large', width: Number(process.env.IMAGE_SIZE_LARGE ?? 1600) },
  ];
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly uploadsDir =
    process.env.UPLOADS_DIR ?? '/usr/src/app/uploads';
  private readonly publicBase =
    process.env.UPLOADS_PUBLIC_BASE_URL ?? 'http://localhost:8585/uploads';
  private readonly quality = Number(process.env.IMAGE_QUALITY ?? 80);
  private readonly sizes = loadSizes();

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  /**
   * The library, scoped to whoever is asking.
   *
   * Everyone used to see everything. Now each person sees what they put
   * there, and only a SUPER_ADMIN can ask for `scope=todas` — which is
   * how ownerless files (staff who left) and support questions stay
   * reachable at all.
   *
   * What is NOT scoped, deliberately: the usage counts below still look
   * at every article and every ad. An image used in somebody else's
   * article has to show as in-use, or its owner would delete it and
   * break a page they cannot see.
   */
  async list(
    query: PageQueryDto & { q?: string; scope?: 'minha' | 'todas' },
    actor: MediaActor,
  ): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);

    if (query.scope === 'todas' && !canReachAll(actor)) {
      // Said plainly rather than silently narrowed to their own. A
      // filter that quietly does something else is worse than one that
      // refuses.
      throw new ForbiddenException(
        'Só o Super Admin pode ver a média de toda a gente.',
      );
    }
    const everyone = query.scope === 'todas' && canReachAll(actor);

    // Free-text search across the filename — keeps the implementation
    // simple while covering the common case ("where's that header.jpg
    // I uploaded last week?"). For URL/mimeType/dimension search we'd
    // need a more involved schema; OOS for now.
    const where = {
      ...(everyone ? {} : { uploadedById: actor.id }),
      ...(query.q
        ? { name: { contains: query.q, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.media.findMany({
        where,
        skip,
        take,
        orderBy: { uploadedAt: 'desc' },
        // The owner's name rides along so the global view can say whose
        // each file is. Explicit select on the relation: `User` carries
        // a password hash, and an include would bring it.
        include: { uploadedBy: { select: { id: true, name: true } } },
      }),
      this.prisma.media.count({ where }),
    ]);

    // Compute "in use" for each item on the current page.
    //
    // An image is in use when:
    //   • some article's coverImageUrl matches one of the variant URLs, OR
    //   • some article's HTML content embeds one of the variant URLs, OR
    //   • some ad slot's imageUrl matches one of the variant URLs.
    //
    // Two bounded queries (articles OR-list and ads OR-list) instead
    // of N+1 per item. With ~24 media per page that's two Postgres
    // scans with OR-lists.
    const variantUrls = items
      .flatMap((m) => [m.url, m.urlMedium, m.urlSmall])
      .filter((u): u is string => Boolean(u));

    type UsageEntry =
      | { kind: 'article'; id: string; slug: string; title: string }
      | { kind: 'ad'; id: string; title: string };

    const usage = new Map<
      string,
      { articleCount: number; adCount: number; usedIn: UsageEntry[] }
    >();
    for (const m of items)
      usage.set(m.id, { articleCount: 0, adCount: 0, usedIn: [] });

    if (variantUrls.length > 0) {
      // Cover-image equality is cheap (indexed string column).
      // Content `contains` is sequential scan — fine at our scale; if
      // the corpus grows we'll add a separate MediaUsage join table.
      const [articleRefs, adRefs] = await Promise.all([
        this.prisma.article.findMany({
          where: {
            OR: [
              { coverImageUrl: { in: variantUrls } },
              ...variantUrls.map((u) => ({ content: { contains: u } })),
            ],
          },
          select: {
            id: true,
            title: true,
            slug: true,
            coverImageUrl: true,
            content: true,
          },
        }),
        this.prisma.ad.findMany({
          where: { imageUrl: { in: variantUrls } },
          select: { id: true, name: true, imageUrl: true },
        }),
      ]);

      for (const m of items) {
        const variants = [m.url, m.urlMedium, m.urlSmall].filter(
          (u): u is string => Boolean(u),
        );
        const articlesUsing = articleRefs.filter((a) =>
          variants.some(
            (u) =>
              a.coverImageUrl === u || (a.content ?? '').includes(u),
          ),
        );
        const adsUsing = adRefs.filter((a) =>
          variants.some((u) => a.imageUrl === u),
        );
        // Build a combined list: articles first (more context for
        // editors), ads next, capped at 5 to keep the panel tidy.
        const usedIn: UsageEntry[] = [
          ...articlesUsing.map(
            (a) =>
              ({
                kind: 'article' as const,
                id: a.id,
                slug: a.slug,
                title: a.title,
              }) satisfies UsageEntry,
          ),
          ...adsUsing.map(
            (a) =>
              ({
                kind: 'ad' as const,
                id: a.id,
                title: a.name,
              }) satisfies UsageEntry,
          ),
        ].slice(0, 5);
        usage.set(m.id, {
          articleCount: articlesUsing.length,
          adCount: adsUsing.length,
          usedIn,
        });
      }
    }

    return {
      items: items.map((m) => {
        const u = usage.get(m.id);
        const articleCount = u?.articleCount ?? 0;
        const adCount = u?.adCount ?? 0;
        return {
          ...m,
          articleCount,
          adCount,
          // Legacy field kept for backwards compatibility — total
          // count regardless of kind. Frontend now also receives
          // articleCount and adCount separately.
          usageCount: articleCount + adCount,
          usedIn: u?.usedIn ?? [],
        };
      }),
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  /** External-URL flow: just persist the URL row, no processing. */
  async create(input: CreateMediaInput, userId: string) {
    if (!/^https?:\/\//i.test(input.url)) {
      throw new BadRequestException('URL inválido (http(s) requerido).');
    }
    const fallbackName =
      input.url.split('/').pop()?.split('?')[0] ?? 'imagem.jpg';
    const created = await this.prisma.media.create({
      data: {
        url: input.url,
        name: input.name ?? fallbackName,
        mimeType: input.mimeType,
        size: input.size,
        width: input.width,
        height: input.height,
        uploadedById: userId,
      },
    });
    void this.activity.record({
      userId,
      action: 'uploaded',
      targetType: 'media',
      targetId: created.id,
      targetLabel: created.name,
    });
    return created;
  }

  /**
   * File-upload flow: take a raw image buffer, generate 3 WebP variants
   * (small / medium / large) at q=80, write them to /uploads/YYYY/MM/,
   * and persist a single Media row whose `url` points to the "large"
   * variant. `withoutEnlargement: true` means a 500×300 input doesn't
   * get blown up to 1600 — variants smaller than the target keep their
   * intrinsic size.
   */
  async uploadFile(file: UploadedFile, userId: string) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Ficheiro vazio.');
    }
    if (!SUPPORTED_MIMES.has(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de ficheiro não suportado: ${file.mimetype}`,
      );
    }

    // Auto-rotate based on EXIF, then read intrinsic size for metadata.
    const rotated = sharp(file.buffer).rotate();
    let metadata: sharp.Metadata;
    try {
      metadata = await rotated.metadata();
    } catch (e) {
      throw new BadRequestException(
        `Imagem inválida: ${(e as Error).message}`,
      );
    }

    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dir = join(this.uploadsDir, yyyy, mm);
    await mkdir(dir, { recursive: true });

    const baseId = randomBytes(8).toString('hex');
    const urls: Record<SizeSpec['key'], string> = {} as never;
    let largeBytes = 0;

    // The written paths, so a failure part-way through can undo itself.
    const written: string[] = [];

    try {
      for (const size of this.sizes) {
        const filename = `${baseId}-${size.key}.webp`;
        const outPath = join(dir, filename);
        const buf = await sharp(file.buffer)
          .rotate()
          .resize({ width: size.width, withoutEnlargement: true })
          .webp({ quality: this.quality })
          .toBuffer();
        await writeFile(outPath, buf);
        written.push(outPath);
        urls[size.key] = `${this.publicBase}/${yyyy}/${mm}/${filename}`;
        if (size.key === 'large') largeBytes = buf.length;
      }
    } catch (e) {
      // A 500 for a corrupt upload, until now.
      //
      // metadata() above is wrapped and gives a clean 400, but a file
      // whose HEADER parses and whose pixel data does not — a truncated
      // download, a half-written export — only fails here, at
      // toBuffer(). The uploader was told "erro interno do servidor"
      // about their own bad file.
      //
      // Whatever variants did get written are removed: leaving them
      // would be files on disk that no row points at, invisible for
      // ever and counting against a quota.
      await this.unlinkVariants(
        written.map((p) => `${this.publicBase}/${yyyy}/${mm}/${p.split(/[\\/]/).pop()}`),
      );
      throw new BadRequestException(
        `Não foi possível processar a imagem: ${(e as Error).message}`,
      );
    }

    const created = await this.prisma.media.create({
      data: {
        url: urls.large,
        urlMedium: urls.medium,
        urlSmall: urls.small,
        // The original filename can be `foo.png` / `foo.jpg`, but the
        // stored file is always WebP after the sharp pipeline. Strip
        // the original extension so the library shows just `foo` —
        // less misleading when authors look at the tooltip.
        name: stripExtension(file.originalname) || baseId,
        mimeType: 'image/webp',
        size: largeBytes,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        uploadedById: userId,
        // What the serving route looks a file up by, and what ties the
        // three variants together as one thing.
        storageKey: `${yyyy}/${mm}/${baseId}`,
        // Private until something publishes it. The default on the
        // column says the same; written here so the intent is visible
        // at the one place a file comes into existence.
        visibility: 'PRIVADO',
      },
    });
    this.logger.log(
      `Uploaded ${baseId} (${metadata.width}×${metadata.height}) → 3 webp variants, large=${(
        largeBytes / 1024
      ).toFixed(1)}KB`,
    );
    void this.activity.record({
      userId,
      action: 'uploaded',
      targetType: 'media',
      targetId: created.id,
      targetLabel: created.name,
    });
    return created;
  }

  /**
   * @param actor the caller. `role` decides whether they may reach past
   *   their own library — the ownership check below is the only thing
   *   stopping one journalist deleting another's photographs.
   */
  async remove(id: string, actor: MediaActor) {
    // Defense-in-depth: refuse to delete media that's still in use.
    // The frontend already blocks the UI but a direct API call would
    // bypass it and leave articles with 404 covers/inline images.
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Imagem não encontrada.');

    // Ownership, checked before anything else is read.
    //
    // Until now any holder of `media.eliminar` could delete anybody's
    // file — an EDITOR_CHEFE tidying up could take out a journalist's
    // unpublished photographs without ever seeing whose they were.
    //
    // 404 rather than 403 for somebody else's media: a 403 confirms the
    // id exists, which is a way to enumerate a library you cannot see.
    // Ownerless rows (staff who left) are the SUPER_ADMIN's to clear.
    if (!canReachAll(actor) && media.uploadedById !== actor.id) {
      throw new NotFoundException('Imagem não encontrada.');
    }

    const variants = [media.url, media.urlMedium, media.urlSmall].filter(
      (u): u is string => Boolean(u),
    );

    const [articleRefs, adRefs] = await Promise.all([
      this.prisma.article.findMany({
        where: {
          OR: [
            { coverImageUrl: { in: variants } },
            ...variants.map((u) => ({ content: { contains: u } })),
          ],
        },
        select: { id: true, slug: true, title: true },
        take: 50,
      }),
      this.prisma.ad.findMany({
        where: { imageUrl: { in: variants } },
        select: { id: true, name: true },
        take: 50,
      }),
    ]);

    if (articleRefs.length + adRefs.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message:
          'Imagem em uso. Remova-a dos artigos / publicidade antes de eliminar.',
        articleCount: articleRefs.length,
        adCount: adRefs.length,
        usedIn: [
          ...articleRefs.map((a) => ({
            kind: 'article' as const,
            id: a.id,
            slug: a.slug,
            title: a.title,
          })),
          ...adRefs.map((a) => ({
            kind: 'ad' as const,
            id: a.id,
            title: a.name,
          })),
        ],
      });
    }

    try {
      const deleted = await this.prisma.media.delete({ where: { id } });
      // The row goes first, the files after. That order matters: if the
      // unlink fails we are left with an orphaned file, which costs
      // disk. The other order would leave a row pointing at nothing,
      // which costs a broken image on a page.
      await this.unlinkVariants(variants);
      void this.activity.record({
        userId: actor.id,
        action: 'deleted',
        targetType: 'media',
        targetId: deleted.id,
        targetLabel: deleted.name,
      });
      return { ok: true };
    } catch (e) {
      if ((e as { code?: string }).code === 'P2025') {
        throw new NotFoundException('Imagem não encontrada.');
      }
      throw e;
    }
  }

  /**
   * Makes every file mentioned in this text publicly fetchable.
   *
   * Called when an article is published and when an ad is switched on —
   * the moment the images stop being drafts and start being something a
   * reader with no session has to be able to load.
   *
   * One-way on purpose. Unpublishing an article does NOT make its
   * images private again: the address has been in the wild, in an RSS
   * reader, in a Facebook cache, in somebody's open tab. Pretending
   * otherwise would be a promise we cannot keep.
   *
   * Never throws. A failure here means an image 404s on a live page,
   * which is bad — but throwing would fail the publish itself, which is
   * worse. It is logged loudly and the serving route heals it on the
   * next request (see the uploads controller).
   */
  async promoteForPublication(
    ...texts: (string | null | undefined)[]
  ): Promise<number> {
    const keys = extractStorageKeys(...texts);
    if (keys.length === 0) return 0;

    try {
      const { count } = await this.prisma.media.updateMany({
        where: { storageKey: { in: keys }, visibility: 'PRIVADO' },
        data: { visibility: 'PUBLICO' },
      });
      if (count > 0) {
        this.logger.log(`${count} media file(s) published.`);
      }
      return count;
    } catch (e) {
      this.logger.error(
        `Failed to publish media ${keys.join(', ')}: ${(e as Error).message}`,
      );
      return 0;
    }
  }

  /**
   * Removes the WebP variants from disk.
   *
   * Until now deleting media dropped the row and left every file behind
   * for ever. Nobody noticed because three WebP variants are small —
   * but the library is about to take 100 MB videos, and an upload
   * quota, at which point invisible files are somebody's quota being
   * eaten by things they already deleted.
   *
   * URLs that are not ours — the paste-a-link path stores whatever
   * address it was given — are skipped rather than guessed at. So is a
   * path that climbs out of the uploads directory, which no URL we
   * generate can produce but which is not worth trusting.
   */
  private async unlinkVariants(urls: string[]): Promise<void> {
    for (const url of urls) {
      if (!url.startsWith(this.publicBase)) continue;

      const relative = url.slice(this.publicBase.length).replace(/^\/+/, '');
      const target = resolve(this.uploadsDir, relative);
      if (!target.startsWith(resolve(this.uploadsDir))) {
        this.logger.warn(`Refusing to unlink outside uploads: ${url}`);
        continue;
      }

      try {
        await unlink(target);
      } catch (e) {
        // ENOENT is the normal case for a file already gone; anything
        // else is worth knowing about but never worth failing the
        // delete over — the row is already committed.
        if ((e as { code?: string }).code !== 'ENOENT') {
          this.logger.warn(`Could not unlink ${target}: ${(e as Error).message}`);
        }
      }
    }
  }
}
