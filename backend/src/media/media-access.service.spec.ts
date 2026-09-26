import { MediaAccessService } from './media-access.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

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
    findUnique: jest.fn().mockResolvedValue({
      id: 'm1',
      url: 'http://api/uploads/2026/09/abc1234567def890-large.webp',
      urlMedium: 'http://api/uploads/2026/09/abc1234567def890-medium.webp',
      urlSmall: 'http://api/uploads/2026/09/abc1234567def890-small.webp',
    }),
    update: jest.fn().mockResolvedValue({}),
  };
  const prisma = {
    media,
    article: { findFirst: jest.fn().mockResolvedValue(null) },
    ad: { findFirst: jest.fn().mockResolvedValue(null) },
    package: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const redis = { getClient: () => ({ del: jest.fn(), get: jest.fn(), set: jest.fn() }) };
  const service = new MediaAccessService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
  );
  return { service, prisma, media };
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

    expect(media.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
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
      expect(media.update).toHaveBeenCalled();
    }
  });

  it('refuses when nothing live uses the file', async () => {
    const { service, media } = harness();

    await expect(service.healIfPublished(PATH)).resolves.toBe(false);
    expect(media.update).not.toHaveBeenCalled();
  });

  it('refuses a path that is not one of ours', async () => {
    const { service, prisma } = harness();

    await expect(service.healIfPublished('../../etc/passwd')).resolves.toBe(
      false,
    );
    expect(prisma.media.findUnique).not.toHaveBeenCalled();
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
