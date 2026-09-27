import { MediaAccessService } from './media-access.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { StorageService } from '../storage/storage.service';

const BASE = 'http://api/uploads/';
const ROW = {
  id: 'm1',
  storageKey: '2026/09/abc1234567def890',
  url: `${BASE}2026/09/abc1234567def890-large.webp`,
  urlMedium: `${BASE}2026/09/abc1234567def890-medium.webp`,
  urlSmall: `${BASE}2026/09/abc1234567def890-small.webp`,
  posterUrl: null as string | null,
};

/**
 * The last thing standing between a private file and a broken image on
 * a live page.
 *
 * Uploaded media starts PRIVADO, and /uploads refuses it to anybody
 * without a session — that is what stops an unpublished investigation's
 * photographs being fetched by whoever guesses the address. Each publish
 * path is supposed to lift it. When one forgets, this is what notices
 * and repairs it, and it can only notice the places it knows to look.
 */
function harness() {
  const media = {
    findUnique: jest.fn().mockResolvedValue(ROW),
    findMany: jest.fn().mockResolvedValue([ROW]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = {
    media,
    article: { findFirst: jest.fn().mockResolvedValue(null) },
    ad: { findFirst: jest.fn().mockResolvedValue(null) },
    package: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const redis = { getClient: () => ({ del: jest.fn(), get: jest.fn(), set: jest.fn() }) };
  const storage = {
    relativeFromUrl: (u: string) => (u.startsWith(BASE) ? u.slice(BASE.length) : null),
    publish: jest.fn().mockResolvedValue(undefined),
  };
  const service = new MediaAccessService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    storage as unknown as StorageService,
  );
  return { service, prisma, media, storage };
}

const PATH = '2026/09/abc1234567def890-large.webp';

describe('MediaAccessService.healIfPublished', () => {
  it('repairs a cover that is live on a published pacote', async () => {
    /*
     * The gap this was added for. Publishing a pacote did not promote
     * its cover, so the cover of every pacote on sale 404'd for readers
     * while looking perfectly fine in the admin — where the staff
     * session makes a private file visible. Nobody in the newsroom could
     * see the bug from inside the newsroom.
     */
    const { service, prisma, media } = harness();
    prisma.package.findFirst.mockResolvedValueOnce({ id: 'p1' });

    await expect(service.healIfPublished(PATH)).resolves.toBe(true);

    expect(media.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1'] } },
      data: { visibility: 'PUBLICO' },
    });
  });

  it('asks only about pacotes that are actually published', async () => {
    // A draft pacote is not a live page, and its cover has no business
    // becoming world-readable because somebody guessed the address.
    const { service, prisma } = harness();

    await service.healIfPublished(PATH);

    expect(prisma.package.findFirst.mock.calls[0]![0]).toMatchObject({
      where: { status: 'PUBLICADO' },
    });
  });

  it('still repairs an article cover, and an ad banner', async () => {
    for (const model of ['article', 'ad'] as const) {
      const { service, prisma, media } = harness();
      prisma[model].findFirst.mockResolvedValueOnce({ id: 'x1' });

      await expect(service.healIfPublished(PATH)).resolves.toBe(true);
      expect(media.updateMany).toHaveBeenCalled();
    }
  });

  it('refuses when nothing live uses the file', async () => {
    const { service, media } = harness();

    await expect(service.healIfPublished(PATH)).resolves.toBe(false);
    expect(media.updateMany).not.toHaveBeenCalled();
  });

  it('still serves a live file whose copy to the public bucket failed', async () => {
    // The API reads the private copy, so the request can be answered; the
    // row stays private so the next promotion or sweep retries the copy.
    const { service, prisma, media, storage } = harness();
    prisma.article.findFirst.mockResolvedValueOnce({ id: 'a1' });
    storage.publish.mockRejectedValueOnce(new Error('R2 down'));

    await expect(service.healIfPublished(PATH)).resolves.toBe(true);
    expect(media.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a path that is not one of ours', async () => {
    const { service, prisma } = harness();

    await expect(service.healIfPublished('../../etc/passwd')).resolves.toBe(
      false,
    );
    expect(prisma.media.findUnique).not.toHaveBeenCalled();
  });
});

describe('MediaAccessService.publishKeys', () => {
  /*
   * With R2, "public" is a copy in the public bucket. A flag that says
   * public over a copy that never happened is an image that 404s on the
   * live site and is never retried — so the copy comes first.
   */
  it('copies every variant, then flips the flag', async () => {
    const { service, media, storage } = harness();

    await expect(service.publishKeys([ROW.storageKey])).resolves.toBe(1);

    expect(storage.publish).toHaveBeenCalledWith([
      '2026/09/abc1234567def890-large.webp',
      '2026/09/abc1234567def890-medium.webp',
      '2026/09/abc1234567def890-small.webp',
    ]);
    expect(storage.publish.mock.invocationCallOrder[0]).toBeLessThan(
      media.updateMany.mock.invocationCallOrder[0]!,
    );
  });

  it("publishes a video's poster with it", async () => {
    const { service, media, storage } = harness();
    media.findMany.mockResolvedValueOnce([
      {
        ...ROW,
        url: `${BASE}2026/09/abc1234567def890-video.mp4`,
        urlMedium: null,
        urlSmall: null,
        posterUrl: `${BASE}2026/09/abc1234567def890-poster.webp`,
      },
    ]);

    await service.publishKeys([ROW.storageKey]);

    expect(storage.publish).toHaveBeenCalledWith([
      '2026/09/abc1234567def890-video.mp4',
      '2026/09/abc1234567def890-poster.webp',
    ]);
  });

  it('leaves a row private when its copy fails, and publishes the rest', async () => {
    const { service, media, storage } = harness();
    media.findMany.mockResolvedValueOnce([
      ROW,
      { ...ROW, id: 'm2', storageKey: '2026/09/fff1234567def890' },
    ]);
    storage.publish
      .mockRejectedValueOnce(new Error('R2 down'))
      .mockResolvedValueOnce(undefined);

    await expect(
      service.publishKeys([ROW.storageKey, '2026/09/fff1234567def890']),
    ).resolves.toBe(1);
    expect(media.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m2'] } },
      data: { visibility: 'PUBLICO' },
    });
  });

  it('only looks at rows that are still private', async () => {
    const { service, media } = harness();

    await service.publishKeys([ROW.storageKey]);

    expect(media.findMany.mock.calls[0]![0]).toMatchObject({
      where: { storageKey: { in: [ROW.storageKey] }, visibility: 'PRIVADO' },
    });
  });
});

describe('MediaAccessService.avatarIsPublic', () => {
  /*
   * The gap this closes: an avatar had exactly one rule — admin-only,
   * always — from before the byline profile page existed to show one to
   * the public. A visitor with no session got a 404 on the photo of
   * anyone with a public /redator page, precisely the surface just
   * built to show it. Same shape of bug as healIfPublished above:
   * correct inside the newsroom, broken for everyone else, and
   * invisible from a staff session because that session grants access
   * on its own.
   */
  it('is public for the avatar of someone who has published something', async () => {
    const { service, prisma } = harness();
    prisma.article.findFirst.mockResolvedValueOnce({ id: 'a1' });

    const isPublic = await service.avatarIsPublic(
      'avatars/cku1a2b3c4d5e6f7g8h9i0j-a2d6968d.webp',
    );

    expect(isPublic).toBe(true);
    expect(prisma.article.findFirst).toHaveBeenCalledWith({
      where: { authorId: 'cku1a2b3c4d5e6f7g8h9i0j', status: 'PUBLICADO' },
      select: { id: true },
    });
  });

  it('stays private for staff who have never published anything', async () => {
    const { service, prisma } = harness();
    prisma.article.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.avatarIsPublic('avatars/cku1a2b3c4d5e6f7g8h9i0j-a2d6968d.webp'),
    ).resolves.toBe(false);
  });

  it('refuses a path that is not shaped like one of our avatars', async () => {
    const { service, prisma } = harness();

    await expect(
      service.avatarIsPublic('avatars/../../etc/passwd'),
    ).resolves.toBe(false);
    expect(prisma.article.findFirst).not.toHaveBeenCalled();
  });
});

describe('MediaAccessService.userIdFromAvatarPath', () => {
  it('reads the id back out of the filename it was written into', () => {
    expect(
      MediaAccessService.userIdFromAvatarPath(
        'avatars/cku1a2b3c4d5e6f7g8h9i0j-a2d6968d.webp',
      ),
    ).toBe('cku1a2b3c4d5e6f7g8h9i0j');
  });

  it('returns null for anything that does not match the shape', () => {
    expect(
      MediaAccessService.userIdFromAvatarPath('avatars/weird.png'),
    ).toBeNull();
    expect(
      MediaAccessService.userIdFromAvatarPath('2026/09/abc-large.webp'),
    ).toBeNull();
  });
});
