import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { VideoService } from './video.service';
import { MediaAccessService } from './media-access.service';
import { StorageService } from '../storage/storage.service';

const BASE = 'http://api/uploads/';

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
    package: { findMany: jest.Mock };
  };
  let storage: {
    relativeFromUrl: (u: string) => string | null;
    delete: jest.Mock;
    publish: jest.Mock;
  };
  let access: { invalidate: jest.Mock; publishKeys: jest.Mock };

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
      package: { findMany: jest.fn().mockResolvedValue([]) },
    };
    storage = {
      relativeFromUrl: (u) => (u.startsWith(BASE) ? u.slice(BASE.length) : null),
      delete: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockResolvedValue(undefined),
    };
    access = {
      invalidate: jest.fn(),
      publishKeys: jest.fn().mockResolvedValue(0),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityLogService, useValue: { record: jest.fn() } },
        // A double: these tests never touch video, and the real thing
        // shells out to ffmpeg.
        {
          provide: VideoService,
          useValue: {
            probe: jest.fn(),
            assertAcceptable: jest.fn(),
            grabPoster: jest.fn().mockResolvedValue(null),
          },
        },
        // Another double: the real one talks to Redis.
        { provide: MediaAccessService, useValue: access },
        { provide: StorageService, useValue: storage },
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

  it('refuses an address that is already one of our files', async () => {
    // Colado, ficava uma linha deste utilizador a apontar para o ficheiro
    // de outro — e eliminá-la apagava o ficheiro do outro.
    await expect(
      service.create(
        { url: `${BASE}2026/09/abc1234567def890-medium.webp` },
        'u1',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.media.create).not.toHaveBeenCalled();
  });

  /** The owner of the fixtures below. A COLUNISTA, so the tests
   *  exercise the ownership check rather than skipping it the way a
   *  SUPER_ADMIN would. */
  const OWNER = { id: 'u1', role: 'COLUNISTA' as const };

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

    it("deletes a video's poster along with the video", async () => {
      // The poster used to be left behind: a file no row pointed at,
      // invisible and impossible to delete from anywhere.
      prisma.media.findUnique.mockResolvedValue({
        id: 'm1',
        url: `${BASE}2026/09/abc1234567def890-video.mp4`,
        urlMedium: null,
        urlSmall: null,
        posterUrl: `${BASE}2026/09/abc1234567def890-poster.webp`,
        name: 'clip',
        uploadedById: OWNER.id,
        storageKey: '2026/09/abc1234567def890',
      });

      await service.remove('m1', OWNER);

      expect(storage.delete).toHaveBeenCalledWith([
        '2026/09/abc1234567def890-video.mp4',
        '2026/09/abc1234567def890-poster.webp',
      ]);
    });

    it('never tries to delete a pasted external address', async () => {
      prisma.media.findUnique.mockResolvedValue({
        id: 'm1',
        url: 'https://cdn/p/a-large.webp',
        urlMedium: null,
        urlSmall: null,
        posterUrl: null,
        name: 'a.jpg',
        uploadedById: OWNER.id,
        storageKey: null,
      });

      await service.remove('m1', OWNER);

      expect(storage.delete).not.toHaveBeenCalled();
    });

    it("never deletes somebody else's file through a row that points at it", async () => {
      // Uma linha antiga (ou criada antes de create() recusar endereços
      // nossos) cujo URL é o ficheiro de outra pessoa. A linha é de quem
      // pede; o ficheiro não.
      prisma.media.findUnique.mockResolvedValue({
        id: 'm1',
        url: `${BASE}2026/09/ffff0000ffff0000-medium.webp`,
        urlMedium: null,
        urlSmall: null,
        posterUrl: null,
        name: 'colada',
        uploadedById: OWNER.id,
        storageKey: null,
      });

      await service.remove('m1', OWNER);

      expect(prisma.media.delete).toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('only deletes files named after the row’s own storageKey', async () => {
      prisma.media.findUnique.mockResolvedValue({
        id: 'm1',
        url: `${BASE}2026/09/abc1234567def890-large.webp`,
        urlMedium: `${BASE}2026/09/ffff0000ffff0000-medium.webp`,
        urlSmall: `${BASE}2026/09/abc1234567def890-small.webp`,
        posterUrl: null,
        name: 'a',
        uploadedById: OWNER.id,
        storageKey: '2026/09/abc1234567def890',
      });

      await service.remove('m1', OWNER);

      expect(storage.delete).toHaveBeenCalledWith([
        '2026/09/abc1234567def890-large.webp',
        '2026/09/abc1234567def890-small.webp',
      ]);
    });
  });

  describe('promoteForPublication()', () => {
    it('publishes every key the text mentions', async () => {
      await service.promoteForPublication(
        `${BASE}2026/09/abc1234567def890-large.webp`,
        `<p><img src="${BASE}2026/09/fff1234567def890-medium.webp"></p>`,
      );
      expect(access.publishKeys).toHaveBeenCalledWith([
        '2026/09/abc1234567def890',
        '2026/09/fff1234567def890',
      ]);
    });

    it('never fails the publish that called it', async () => {
      access.publishKeys.mockRejectedValueOnce(new Error('database down'));
      await expect(
        service.promoteForPublication(`${BASE}2026/09/abc1234567def890-large.webp`),
      ).resolves.toBe(0);
    });
  });

  describe('sweepPublished()', () => {
    it('publishes what live articles, ads and pacotes use, and their authors’ avatars', async () => {
      prisma.article.findMany.mockResolvedValue([
        {
          coverImageUrl: `${BASE}2026/09/aaa1234567def890-large.webp`,
          content: `<img src="${BASE}2026/09/bbb1234567def890-small.webp">`,
          author: { avatarUrl: `${BASE}avatars/cku1-a2d6968d.webp` },
        },
      ]);
      prisma.ad.findMany.mockResolvedValue([
        { imageUrl: `${BASE}2026/09/ccc1234567def890-large.webp` },
      ]);
      prisma.package.findMany.mockResolvedValue([
        { coverImageUrl: `${BASE}2026/09/ddd1234567def890-large.webp` },
      ]);

      await service.sweepPublished(new Date('2026-09-27T12:00:00Z'));

      expect(access.publishKeys).toHaveBeenCalledWith([
        '2026/09/aaa1234567def890',
        '2026/09/bbb1234567def890',
        '2026/09/ccc1234567def890',
        '2026/09/ddd1234567def890',
      ]);
      expect(storage.publish).toHaveBeenCalledWith(['avatars/cku1-a2d6968d.webp']);
      // Only articles touched in the last day — bounded, not a scan of
      // the whole archive every ten minutes.
      expect(prisma.article.findMany.mock.calls[0]![0]).toMatchObject({
        where: {
          status: 'PUBLICADO',
          updatedAt: { gte: new Date('2026-09-26T12:00:00Z') },
        },
      });
    });
  });
});
