import { Test } from '@nestjs/testing';
import { AdsService } from './ads.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';

describe('AdsService', () => {
  let service: AdsService;
  let prisma: { ad: { findMany: jest.Mock; upsert: jest.Mock; update: jest.Mock } };
  let media: { promoteForPublication: jest.Mock };

  beforeEach(async () => {
    prisma = {
      ad: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    media = { promoteForPublication: jest.fn().mockResolvedValue(0) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MediaService, useValue: media },
      ],
    }).compile();
    service = moduleRef.get(AdsService);
  });

  it('ensureDefaults() upserts the full set of known slots', async () => {
    await service.ensureDefaults();
    expect(prisma.ad.upsert).toHaveBeenCalledTimes(11);
  });

  it('listByPage() filters by page + enabled', async () => {
    await service.listByPage('Homepage');
    expect(prisma.ad.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { page: 'Homepage', enabled: true },
      }),
    );
  });

  describe('the banner is published with the slot', () => {
    // This was missing entirely: ad images reached readers only
    // because the serving route's last-resort repair noticed they were
    // live and fixed them one at a time, logging a warning for every
    // banner on the site.
    it('publishes the image when the slot ends up live', async () => {
      prisma.ad.update.mockResolvedValue({
        id: 'homepage-leaderboard',
        enabled: true,
        imageUrl: 'http://api/uploads/2026/09/abc-large.webp',
      });
      await service.update('homepage-leaderboard', { enabled: true });
      expect(media.promoteForPublication).toHaveBeenCalledWith(
        'http://api/uploads/2026/09/abc-large.webp',
      );
    });

    it('reads the row that came back, not the input', async () => {
      // Setting an image on a slot that is ALREADY on has to publish
      // it too, and the input says nothing about `enabled`. Deciding
      // from the input would leave that banner private.
      prisma.ad.update.mockResolvedValue({
        id: 'homepage-mid',
        enabled: true,
        imageUrl: 'http://api/uploads/2026/09/def-large.webp',
      });
      await service.update('homepage-mid', {
        imageUrl: 'http://api/uploads/2026/09/def-large.webp',
      });
      expect(media.promoteForPublication).toHaveBeenCalled();
    });

    it('leaves the banner of a disabled slot private', async () => {
      prisma.ad.update.mockResolvedValue({
        id: 'homepage-mid',
        enabled: false,
        imageUrl: 'http://api/uploads/2026/09/ghi-large.webp',
      });
      await service.update('homepage-mid', { enabled: false });
      expect(media.promoteForPublication).not.toHaveBeenCalled();
    });
  });
});
