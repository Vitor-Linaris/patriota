import { Test } from '@nestjs/testing';
import { AdsService } from './ads.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AdsService', () => {
  let service: AdsService;
  let prisma: { ad: { findMany: jest.Mock; upsert: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      ad: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdsService,
        { provide: PrismaService, useValue: prisma },
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
});
