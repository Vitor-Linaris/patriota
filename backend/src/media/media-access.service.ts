import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';

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
    private readonly storage: StorageService,
  ) {}

  /**
   * The storage key inside an uploads path, or null.
   *
   * Every shape our own pipeline writes, and no others:
   *   - three image variants, `-large|medium|small.webp`
   *   - the video itself, `-video.mp4` or `-video.webm`
   *   - the still taken from it, `-poster.webp`
   *
   * All of them share one key, which is the point: a video and its
   * thumbnail are one thing, and publishing the article has to make
   * both reachable at once.
   *
   * Anything else — a traversal attempt, an avatar, a hand-placed
   * file — returns null and is handled by the caller.
   */
  static keyFromPath(path: string): string | null {
    const m =
      /^(\d{4}\/\d{2}\/[0-9a-f]{8,})-(?:large|medium|small|poster)\.webp$|^(\d{4}\/\d{2}\/[0-9a-f]{8,})-video\.(?:mp4|webm)$/.exec(
        path,
      );
    return m ? (m[1] ?? m[2]!) : null;
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

    const [article, ad, pkg] = await Promise.all([
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
      // A pacote's cover. Added late, and the gap it left is exactly the
      // failure this net exists to catch: publishing a pacote did not
      // promote its cover, so every pacote on sale showed a broken image
      // to readers while looking correct in the admin, where the session
      // makes a private file visible. The publish path now promotes it;
      // this is what quietly repairs the ones already out there.
      this.prisma.package.findFirst({
        where: { status: 'PUBLICADO', coverImageUrl: { in: variants } },
        select: { id: true },
      }),
    ]);

    if (!article && !ad && !pkg) return false;

    const where = article ? 'an article' : ad ? 'an ad' : 'a pacote';
    this.logger.warn(
      `Media ${key} was private but is live on ${where}. Publishing it now.`,
    );
    // True even if the copy fails: this request is served by the API,
    // which reads the private copy, and the file IS live. The flag stays
    // private, so the next promotion or sweep tries the copy again.
    await this.publishKeys([key]);
    return true;
  }

  /**
   * Makes these media public — the copy first, the flag after.
   *
   * The only place a Media row becomes PUBLICO. With R2 behind it,
   * public means a copy in the public bucket, and the order is the whole
   * point: a flag that says public over a copy that failed would never
   * be retried, and the image would 404 on the live site for good. A
   * failed copy leaves the row private, and the next promotion or the
   * sweep (MediaService.sweepPublished) picks it up again.
   *
   * The poster is published with its video: it is what a `<video>` shows
   * before anybody presses play.
   *
   * Returns how many rows it published. Rows already public are skipped.
   */
  async publishKeys(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;

    const rows = await this.prisma.media.findMany({
      where: { storageKey: { in: keys }, visibility: 'PRIVADO' },
      select: {
        id: true,
        storageKey: true,
        url: true,
        urlMedium: true,
        urlSmall: true,
        posterUrl: true,
      },
    });

    const published: { id: string; storageKey: string }[] = [];
    for (const row of rows) {
      const rels = [row.url, row.urlMedium, row.urlSmall, row.posterUrl]
        .map((u) => (u ? this.storage.relativeFromUrl(u) : null))
        .filter((r): r is string => r !== null);
      try {
        await this.storage.publish(rels);
        published.push({ id: row.id, storageKey: row.storageKey! });
      } catch (e) {
        this.logger.error(
          `Could not publish media ${row.storageKey}: ${(e as Error).message}`,
        );
      }
    }
    if (published.length === 0) return 0;

    await this.prisma.media.updateMany({
      where: { id: { in: published.map((p) => p.id) } },
      data: { visibility: 'PUBLICO' },
    });
    // The cached answer still says "private", and it is what the serving
    // route reads. Without this, an article that has just gone out shows
    // broken images to every reader until that entry expires.
    await Promise.all(published.map((p) => this.invalidate(p.storageKey)));
    return published.length;
  }

  /**
   * The user id embedded in an avatar's filename, or null if the shape
   * doesn't match. See UsersService.uploadAvatar: `${userId}-${hex}.webp`
   * — the id prefix is there on purpose ("makes ownership inspectable on
   * disk"), which is exactly what this reads back.
   */
  static userIdFromAvatarPath(relative: string): string | null {
    const m = /^avatars\/([a-z0-9]+)-[0-9a-f]{8}\.webp$/i.exec(relative);
    return m ? m[1] : null;
  }

  /**
   * Whether an avatar belongs to someone with a public byline.
   *
   * Avatars have no Media row (uploadAvatar writes straight to disk),
   * so they never go through `forPath` above and were, until now,
   * unconditionally staff-only — correct for most of the newsroom, but
   * wrong the moment a public profile page exists to show one. The gate
   * here is deliberately the SAME test as
   * ArticlesService.publicAuthorProfile: at least one PUBLICADO
   * article. A photo and a byline appear and disappear from public view
   * together, because they answer the same question — "does this
   * person have a public page?" — and a second copy of that rule is a
   * second place for it to drift.
   *
   * Uncached, unlike `forPath`: avatar traffic is a sliver of article
   * covers, and a stale "yes" here would keep a departed contributor's
   * private photo public for up to a day — worse than the extra query.
   */
  async avatarIsPublic(relative: string): Promise<boolean> {
    const userId = MediaAccessService.userIdFromAvatarPath(relative);
    if (!userId) return false;
    const row = await this.prisma.article.findFirst({
      where: { authorId: userId, status: 'PUBLICADO' },
      select: { id: true },
    });
    return row !== null;
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
