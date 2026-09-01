import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/** What the serving route needs to know about one path. */
export interface FileAccess {
  /** Anyone with the address may fetch it. */
  isPublic: boolean;
  /** Owner, when there is a Media row. Null for ownerless or unknown. */
  ownerId: string | null;
  /** False when nothing in the database claims this path. */
  known: boolean;
}

/** Redis key for one storage key's answer. */
const cacheKey = (storageKey: string) => `media:vis:${storageKey}`;

/**
 * How long a "this is public" answer is kept.
 *
 * Long, because it only ever goes one way: media becomes public when
 * something publishes it and never goes back (see
 * MediaService.promoteForPublication). A stale "public" is therefore
 * not stale at all — it is still true.
 */
const PUBLIC_TTL_SECONDS = 60 * 60 * 24;

/**
 * How long a "this is private" answer is kept.
 *
 * Short, because this one DOES change: the next publish makes it
 * public, and a reader hitting a 404 on a freshly published article for
 * up to a minute is exactly the failure this cache must not cause.
 */
const PRIVATE_TTL_SECONDS = 30;

/**
 * Decides whether a file may be served, and to whom.
 *
 * Split out of MediaService because it sits on the hot path — every
 * image on every page of the newspaper goes through here — and its job
 * is one question with a cache in front, not media management.
 */
@Injectable()
export class MediaAccessService {
  private readonly logger = new Logger(MediaAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * The storage key inside an uploads path, or null.
   *
   * Accepts `2026/09/<hex>-large.webp` and its siblings — the shape our
   * own pipeline writes. Anything else (a traversal attempt, an avatar,
   * a hand-placed file) returns null and is handled by the caller.
   */
  static keyFromPath(path: string): string | null {
    const m = /^(\d{4}\/\d{2}\/[0-9a-f]{8,})-(?:large|medium|small)\.webp$/.exec(
      path,
    );
    return m ? m[1]! : null;
  }

  async forPath(path: string): Promise<FileAccess> {
    const key = MediaAccessService.keyFromPath(path);
    if (!key) return { isPublic: false, ownerId: null, known: false };

    const cached = await this.readCache(key);
    if (cached) return cached;

    const row = await this.prisma.media.findUnique({
      where: { storageKey: key },
      select: { visibility: true, uploadedById: true, url: true },
    });
    if (!row) return { isPublic: false, ownerId: null, known: false };

    const answer: FileAccess = {
      isPublic: row.visibility === 'PUBLICO',
      ownerId: row.uploadedById,
      known: true,
    };
    await this.writeCache(key, answer);
    return answer;
  }

  /**
   * Last resort before refusing: is this file actually on a live page?
   *
   * A promotion can be missed — a publish path nobody thought of, a
   * database blip, an article whose body was edited by something that
   * did not go through the service. The consequence would be a broken
   * image on a published article, which readers see and nobody gets
   * told about.
   *
   * So before a 404, the question is asked directly of the articles and
   * ads. If the answer is yes the row is corrected on the spot, and the
   * next request takes the fast path.
   *
   * Only reached for files that are private AND requested by somebody
   * without access, which on a healthy system is close to never.
   */
  async healIfPublished(path: string): Promise<boolean> {
    const key = MediaAccessService.keyFromPath(path);
    if (!key) return false;

    const row = await this.prisma.media.findUnique({
      where: { storageKey: key },
      select: { id: true, url: true, urlMedium: true, urlSmall: true },
    });
    if (!row) return false;

    const variants = [row.url, row.urlMedium, row.urlSmall].filter(
      (u): u is string => Boolean(u),
    );

    const [article, ad] = await Promise.all([
      this.prisma.article.findFirst({
        where: {
          status: 'PUBLICADO',
          OR: [
            { coverImageUrl: { in: variants } },
            ...variants.map((u) => ({ content: { contains: u } })),
          ],
        },
        select: { id: true },
      }),
      this.prisma.ad.findFirst({
        where: { enabled: true, imageUrl: { in: variants } },
        select: { id: true },
      }),
    ]);

    if (!article && !ad) return false;

    this.logger.warn(
      `Media ${key} was private but is live on ${article ? 'an article' : 'an ad'}. Publishing it now.`,
    );
    await this.prisma.media.update({
      where: { id: row.id },
      data: { visibility: 'PUBLICO' },
    });
    await this.invalidate(key);
    return true;
  }

  /** Drops a cached answer, so the next request re-reads the row. */
  async invalidate(storageKey: string): Promise<void> {
    try {
      await this.redis.getClient().del(cacheKey(storageKey));
    } catch {
      // A cache that cannot be cleared is a stale answer for at most
      // its TTL. Not worth failing anything over.
    }
  }

  private async readCache(key: string): Promise<FileAccess | null> {
    try {
      const raw = await this.redis.getClient().get(cacheKey(key));
      return raw ? (JSON.parse(raw) as FileAccess) : null;
    } catch (e) {
      // Redis being down must not take the newspaper's images with it.
      // Falling through to the database is slower and correct.
      this.logger.warn(`Media cache read failed: ${(e as Error).message}`);
      return null;
    }
  }

  private async writeCache(key: string, answer: FileAccess): Promise<void> {
    try {
      await this.redis
        .getClient()
        .set(
          cacheKey(key),
          JSON.stringify(answer),
          'EX',
          answer.isPublic ? PUBLIC_TTL_SECONDS : PRIVATE_TTL_SECONDS,
        );
    } catch {
      /* see readCache */
    }
  }
}
