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
