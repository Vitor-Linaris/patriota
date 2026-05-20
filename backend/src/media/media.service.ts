import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import {
  PageQueryDto,
  PageResult,
  toSkipTake,
} from '../common/dto/pagination.dto';

export interface CreateMediaInput {
  url: string;
  name?: string;
  width?: number;
  height?: number;
  size?: number;
  mimeType?: string;
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

  async list(
    query: PageQueryDto & { q?: string },
  ): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);
    // Free-text search across the filename — keeps the implementation
    // simple while covering the common case ("where's that header.jpg
    // I uploaded last week?"). For URL/mimeType/dimension search we'd
    // need a more involved schema; OOS for now.
    const where = query.q
      ? { name: { contains: query.q, mode: 'insensitive' as const } }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.media.findMany({
        where,
        skip,
        take,
        orderBy: { uploadedAt: 'desc' },
      }),
      this.prisma.media.count({ where }),
    ]);

    // Compute "in use" for each item on the current page.
    //
    // An image is in use when:
    //   • some article's coverImageUrl matches one of the variant URLs, OR
    //   • some article's HTML content embeds one of the variant URLs.
    //
    // We do it in ONE bounded query (only articles that reference at
    // least one URL on this page) instead of N+1 per item. With ~24
    // media per page that's a single Postgres scan with an OR list.
    const variantUrls = items
      .flatMap((m) => [m.url, m.urlMedium, m.urlSmall])
      .filter((u): u is string => Boolean(u));

    type UsedArticle = { id: string; slug: string; title: string };
    const usage = new Map<
      string,
      { articleCount: number; usedIn: UsedArticle[] }
    >();
    for (const m of items) usage.set(m.id, { articleCount: 0, usedIn: [] });

    if (variantUrls.length > 0) {
      // Cover-image equality is cheap (indexed string column).
      // Content `contains` is sequential scan — fine at our scale; if
      // the corpus grows we'll add a separate MediaUsage join table.
      const refs = await this.prisma.article.findMany({
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
      });

      for (const m of items) {
        const variants = [m.url, m.urlMedium, m.urlSmall].filter(
          (u): u is string => Boolean(u),
        );
        const usedBy = refs.filter((a) =>
          variants.some(
            (u) =>
              a.coverImageUrl === u || (a.content ?? '').includes(u),
          ),
        );
        usage.set(m.id, {
          articleCount: usedBy.length,
          usedIn: usedBy.slice(0, 5).map((a) => ({
            id: a.id,
            slug: a.slug,
            title: a.title,
          })),
        });
      }
    }

    return {
      items: items.map((m) => ({
        ...m,
        articleCount: usage.get(m.id)?.articleCount ?? 0,
        usedIn: usage.get(m.id)?.usedIn ?? [],
      })),
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

    for (const size of this.sizes) {
      const filename = `${baseId}-${size.key}.webp`;
      const outPath = join(dir, filename);
      const buf = await sharp(file.buffer)
        .rotate()
        .resize({ width: size.width, withoutEnlargement: true })
        .webp({ quality: this.quality })
        .toBuffer();
      await writeFile(outPath, buf);
      urls[size.key] = `${this.publicBase}/${yyyy}/${mm}/${filename}`;
      if (size.key === 'large') largeBytes = buf.length;
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

  async remove(id: string, userId: string) {
    // Defense-in-depth: refuse to delete media that's still in use.
    // The frontend already blocks the UI but a direct API call would
    // bypass it and leave articles with 404 covers/inline images.
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Imagem não encontrada.');

    const variants = [media.url, media.urlMedium, media.urlSmall].filter(
      (u): u is string => Boolean(u),
    );

    const refs = await this.prisma.article.findMany({
      where: {
        OR: [
          { coverImageUrl: { in: variants } },
          ...variants.map((u) => ({ content: { contains: u } })),
        ],
      },
      select: { id: true, slug: true, title: true },
      take: 50,
    });

    if (refs.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message:
          'Imagem em uso. Remova-a dos artigos abaixo antes de eliminar.',
        articleCount: refs.length,
        usedIn: refs,
      });
    }

    try {
      const deleted = await this.prisma.media.delete({ where: { id } });
      void this.activity.record({
        userId,
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
}
