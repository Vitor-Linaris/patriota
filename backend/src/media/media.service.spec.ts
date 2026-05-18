import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

describe('MediaService', () => {
  let service: MediaService;
  let prisma: { media: { findMany: jest.Mock; count: jest.Mock; create: jest.Mock; delete: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      media: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'm1', name: 'a.jpg' }),
        delete: jest.fn().mockResolvedValue({ id: 'm1', name: 'a.jpg' }),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityLogService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(MediaService);
  });

  it('rejects non-http URLs', async () => {
    await expect(
      service.create({ url: 'ftp://x.jpg' }, 'u1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('derives a name from the URL when none is provided', async () => {
    await service.create({ url: 'https://example.com/path/foto.jpg?v=1' }, 'u1');
    expect(prisma.media.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'foto.jpg' }),
      }),
    );
  });
});
