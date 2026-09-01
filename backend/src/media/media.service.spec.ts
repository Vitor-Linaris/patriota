import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

describe('MediaService', () => {
  let service: MediaService;
  let prisma: {
    media: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    article: { findMany: jest.Mock };
    ad: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      media: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'm1', name: 'a.jpg' }),
        delete: jest.fn().mockResolvedValue({ id: 'm1', name: 'a.jpg' }),
      },
      article: { findMany: jest.fn().mockResolvedValue([]) },
      ad: { findMany: jest.fn().mockResolvedValue([]) },
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

  /** The owner of the fixtures below. A JORNALISTA, so the tests
   *  exercise the ownership check rather than skipping it the way a
   *  SUPER_ADMIN would. */
  const OWNER = { id: 'u1', role: 'JORNALISTA' as const };

  describe('remove()', () => {
    it('throws NotFoundException when media does not exist', async () => {
      prisma.media.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing', OWNER)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.media.delete).not.toHaveBeenCalled();
    });

    it('blocks deletion with ConflictException when in use', async () => {
      prisma.media.findUnique.mockResolvedValue({
        id: 'm1',
        url: 'https://cdn/p/a-large.webp',
        urlMedium: 'https://cdn/p/a-medium.webp',
        urlSmall: 'https://cdn/p/a-small.webp',
        name: 'a.jpg',
        uploadedById: OWNER.id,
      });
      prisma.article.findMany.mockResolvedValue([
        { id: 'art-1', slug: 'titulo-1', title: 'Título 1' },
        { id: 'art-2', slug: 'titulo-2', title: 'Título 2' },
      ]);
      await expect(service.remove('m1', OWNER)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.media.delete).not.toHaveBeenCalled();
    });

    it('deletes when no article references the media', async () => {
      prisma.media.findUnique.mockResolvedValue({
        id: 'm1',
        url: 'https://cdn/p/a-large.webp',
        urlMedium: null,
        urlSmall: null,
        name: 'a.jpg',
        uploadedById: OWNER.id,
      });
      prisma.article.findMany.mockResolvedValue([]);
      await expect(service.remove('m1', OWNER)).resolves.toEqual({ ok: true });
      expect(prisma.media.delete).toHaveBeenCalledWith({
        where: { id: 'm1' },
      });
    });

    it('will not let one person delete another person\'s media', async () => {
      // Until the library became per-person, any holder of
      // media.eliminar could delete anybody's file. 404 rather than
      // 403: a 403 confirms the id exists, which is a way to enumerate
      // a library you are not allowed to see.
      prisma.media.findUnique.mockResolvedValue({
        id: 'm1',
        url: 'https://cdn/p/a-large.webp',
        urlMedium: null,
        urlSmall: null,
        name: 'a.jpg',
        uploadedById: 'somebody-else',
      });

      await expect(service.remove('m1', OWNER)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.media.delete).not.toHaveBeenCalled();
      // And it refuses BEFORE looking anything up — no usage query, no
      // hint that the id was real.
      expect(prisma.article.findMany).not.toHaveBeenCalled();
    });

    it('lets a SUPER_ADMIN delete media that is nobody\'s', async () => {
      // Files left behind by staff who have gone. Somebody has to be
      // able to clear them, or they are permanent.
      prisma.media.findUnique.mockResolvedValue({
        id: 'm1',
        url: 'https://cdn/p/a-large.webp',
        urlMedium: null,
        urlSmall: null,
        name: 'a.jpg',
        uploadedById: null,
      });
      prisma.article.findMany.mockResolvedValue([]);

      await expect(
        service.remove('m1', { id: 'boss', role: 'SUPER_ADMIN' }),
      ).resolves.toEqual({ ok: true });
    });
  });
});
