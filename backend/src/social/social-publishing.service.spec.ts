import { Test } from '@nestjs/testing';
import { SocialPublishingService } from './social-publishing.service';
import { SocialConfig } from './social.config';
import { FacebookClient } from './facebook.client';
import { InstagramClient } from './instagram.client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The two things that must never happen, and one that must.
 *
 *  1. The archive must never be posted. That is the migration backfill's
 *     job, but the lookback window here is the second line of defence
 *     and it is cheap to hold onto.
 *  2. A post must never go out twice. Instagram has no quiet undo, so
 *     the claim before sending is load-bearing in a way the notification
 *     outbox's absent one is not.
 *  3. The cancellation window must actually work — it is the feature the
 *     client asked for by name.
 */
function makePrismaMock() {
  return {
    article: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    socialPost: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

const ARTICLE = {
  id: 'art1',
  slug: 'obras-na-rua-da-se',
  title: 'Obras na Rua da Sé',
  summary: 'A empreitada começa na segunda-feira e dura três meses.',
  coverImageUrl:
    'http://localhost:8585/uploads/2026/09/abcdef1234567890-large.webp',
  category: { name: 'Madeira' },
};

describe('SocialPublishingService', () => {
  let service: SocialPublishingService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let facebook: { configured: boolean; publish: jest.Mock };
  let instagram: { configured: boolean; publish: jest.Mock };
  let policy: Record<string, unknown>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    facebook = {
      configured: true,
      publish: jest.fn().mockResolvedValue({ remoteId: 'p_1', remoteUrl: 'u' }),
    };
    instagram = {
      configured: true,
      publish: jest.fn().mockResolvedValue({ remoteId: 'i_1', remoteUrl: 'u' }),
    };
    policy = {
      facebookEnabled: true,
      instagramEnabled: true,
      delayMinutes: 10,
      facebookTemplate: '{titulo}\n\n{resumo}',
      instagramTemplate: '{titulo} — {categoria}',
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SocialPublishingService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: SocialConfig,
          useValue: {
            enabled: true,
            siteUrl: 'https://www.opatriota.pt',
            apiOrigin: 'http://localhost:8585',
            warnIfUnconfigured: () => undefined,
            policy: () => Promise.resolve(policy),
          },
        },
        { provide: FacebookClient, useValue: facebook },
        { provide: InstagramClient, useValue: instagram },
      ],
    }).compile();

    service = moduleRef.get(SocialPublishingService);
  });

  describe('enqueueDueArticles', () => {
    it('claims the article once and queues one row per network', async () => {
      prisma.article.findMany.mockResolvedValue([ARTICLE]);
      prisma.socialPost.createMany.mockResolvedValue({ count: 2 });

      const now = new Date('2026-09-17T09:00:00Z');
      await service.enqueueDueArticles(now);

      // The claim is conditional on the column still being null. That
      // condition IS the lock — without it two instances both enqueue.
      expect(prisma.article.updateMany).toHaveBeenCalledWith({
        where: { id: 'art1', socialQueuedAt: null },
        data: { socialQueuedAt: now },
      });

      const rows = prisma.socialPost.createMany.mock.calls[0][0].data;
      expect(rows.map((r: { network: string }) => r.network).sort()).toEqual([
        'FACEBOOK',
        'INSTAGRAM',
      ]);
    });

    it('loses the claim race quietly and writes nothing', async () => {
      prisma.article.findMany.mockResolvedValue([ARTICLE]);
      prisma.article.updateMany.mockResolvedValue({ count: 0 });

      const queued = await service.enqueueDueArticles();

      expect(queued).toBe(0);
      expect(prisma.socialPost.createMany).not.toHaveBeenCalled();
    });

    it('only looks at articles published in the last 24 hours', async () => {
      const now = new Date('2026-09-17T09:00:00Z');
      await service.enqueueDueArticles(now);

      const where = prisma.article.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('PUBLICADO');
      expect(where.socialQueuedAt).toBeNull();
      expect(where.publishedAt.gte).toEqual(new Date('2026-09-16T09:00:00Z'));
    });

    it('schedules for now + the configured delay — the cancel window', async () => {
      prisma.article.findMany.mockResolvedValue([ARTICLE]);
      policy.delayMinutes = 25;

      const now = new Date('2026-09-17T09:00:00Z');
      await service.enqueueDueArticles(now);

      const rows = prisma.socialPost.createMany.mock.calls[0][0].data;
      for (const row of rows) {
        expect(row.scheduledFor).toEqual(new Date('2026-09-17T09:25:00Z'));
      }
    });

    it('sends Facebook a link and no image; Instagram an image and no link in the caption', async () => {
      prisma.article.findMany.mockResolvedValue([ARTICLE]);
      await service.enqueueDueArticles();

      const rows: {
        network: string;
        imageUrl: string | null;
        linkUrl: string;
        message: string;
      }[] = prisma.socialPost.createMany.mock.calls[0][0].data;

      const fb = rows.find((r) => r.network === 'FACEBOOK')!;
      expect(fb.imageUrl).toBeNull();
      expect(fb.linkUrl).toBe(
        'https://www.opatriota.pt/artigo/obras-na-rua-da-se',
      );

      const ig = rows.find((r) => r.network === 'INSTAGRAM')!;
      // Converted on the way out, not a stored variant — see
      // SocialImageController.
      expect(ig.imageUrl).toBe(
        'http://localhost:8585/social-image/2026/09/abcdef1234567890.jpg',
      );
      // The default Instagram template carries no {link}: a caption
      // cannot hold a clickable one, and a bare URL reads as a mistake.
      expect(ig.message).not.toContain('http');
    });

    it('skips Instagram when the cover is not one of ours to convert', async () => {
      prisma.article.findMany.mockResolvedValue([
        { ...ARTICLE, coverImageUrl: 'https://exemplo.pt/foto.jpg' },
      ]);
      await service.enqueueDueArticles();

      const rows = prisma.socialPost.createMany.mock.calls[0][0].data;
      expect(rows.map((r: { network: string }) => r.network)).toEqual([
        'FACEBOOK',
      ]);
    });

    it('does nothing at all when both networks are switched off', async () => {
      policy.facebookEnabled = false;
      policy.instagramEnabled = false;

      await service.enqueueDueArticles();

      expect(prisma.article.findMany).not.toHaveBeenCalled();
    });
  });

  describe('deliver', () => {
    const due = {
      id: 'sp1',
      articleId: 'art1',
      network: 'FACEBOOK' as const,
      status: 'AGENDADO',
      message: 'Obras na Rua da Sé',
      imageUrl: null,
      linkUrl: 'https://www.opatriota.pt/artigo/obras-na-rua-da-se',
      attempts: 0,
    };

    it('claims the row BEFORE calling Meta', async () => {
      prisma.socialPost.findMany.mockResolvedValue([due]);
      await service.deliver();

      expect(prisma.socialPost.updateMany).toHaveBeenCalledWith({
        where: { id: 'sp1', status: 'AGENDADO' },
        data: { status: 'A_ENVIAR' },
      });
      expect(facebook.publish).toHaveBeenCalled();
    });

    it('does not call Meta when another instance won the claim', async () => {
      prisma.socialPost.findMany.mockResolvedValue([due]);
      prisma.socialPost.updateMany.mockResolvedValue({ count: 0 });

      const sent = await service.deliver();

      expect(sent).toBe(0);
      // The whole point. A second call here is a duplicate post that
      // somebody has to go and delete in front of the audience.
      expect(facebook.publish).not.toHaveBeenCalled();
    });

    it('records the remote id so the post can be found again', async () => {
      prisma.socialPost.findMany.mockResolvedValue([due]);
      await service.deliver();

      expect(prisma.socialPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sp1' },
          data: expect.objectContaining({
            status: 'ENVIADO',
            remoteId: 'p_1',
          }),
        }),
      );
    });

    it('returns a failed row to the queue until the retries are spent', async () => {
      prisma.socialPost.findMany.mockResolvedValue([{ ...due, attempts: 0 }]);
      facebook.publish.mockRejectedValue(new Error('rede em baixo'));

      await service.deliver();

      expect(prisma.socialPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'AGENDADO', attempts: 1 }),
        }),
      );
    });

    it('gives up after the third attempt instead of blocking the queue', async () => {
      prisma.socialPost.findMany.mockResolvedValue([{ ...due, attempts: 2 }]);
      facebook.publish.mockRejectedValue(new Error('token inválido'));

      await service.deliver();

      expect(prisma.socialPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FALHOU',
            attempts: 3,
            lastError: 'token inválido',
          }),
        }),
      );
    });
  });

  describe('a fila é editável só enquanto está agendada', () => {
    it('refuses to rewrite a post that already went out', async () => {
      prisma.socialPost.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.updateMessage('sp1', 'outro texto')).rejects.toThrow(
        /já saiu/,
      );
    });

    it('refuses to cancel a post that already went out', async () => {
      prisma.socialPost.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cancel('sp1')).rejects.toThrow(/já saiu/);
    });

    it('refuses an empty message rather than publishing a blank post', async () => {
      await expect(service.updateMessage('sp1', '   ')).rejects.toThrow(
        /vazio/,
      );
      expect(prisma.socialPost.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe('SocialPublishingService — o texto', () => {
  it('não deixa um buraco quando o artigo não tem resumo', async () => {
    const prisma = makePrismaMock();
    prisma.article.findMany.mockResolvedValue([{ ...ARTICLE, summary: '' }]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        SocialPublishingService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: SocialConfig,
          useValue: {
            enabled: true,
            siteUrl: 'https://www.opatriota.pt',
            apiOrigin: 'http://localhost:8585',
            warnIfUnconfigured: () => undefined,
            policy: () =>
              Promise.resolve({
                facebookEnabled: true,
                instagramEnabled: false,
                delayMinutes: 10,
                facebookTemplate: '{titulo}\n\n{resumo}\n\nMais em {link}',
                instagramTemplate: '{titulo}',
              }),
          },
        },
        { provide: FacebookClient, useValue: { configured: true } },
        { provide: InstagramClient, useValue: { configured: false } },
      ],
    }).compile();

    await moduleRef.get(SocialPublishingService).enqueueDueArticles();

    const rows = prisma.socialPost.createMany.mock.calls[0][0].data;
    expect(rows[0].message).toBe(
      'Obras na Rua da Sé\n\nMais em https://www.opatriota.pt/artigo/obras-na-rua-da-se',
    );
  });

  it('corta um resumo longo em vez de o deixar rebentar a legenda', async () => {
    const prisma = makePrismaMock();
    prisma.article.findMany.mockResolvedValue([
      { ...ARTICLE, summary: 'a'.repeat(900) },
    ]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        SocialPublishingService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: SocialConfig,
          useValue: {
            enabled: true,
            siteUrl: 'https://www.opatriota.pt',
            apiOrigin: 'http://localhost:8585',
            warnIfUnconfigured: () => undefined,
            policy: () =>
              Promise.resolve({
                facebookEnabled: true,
                instagramEnabled: false,
                delayMinutes: 10,
                facebookTemplate: '{resumo}',
                instagramTemplate: '{titulo}',
              }),
          },
        },
        { provide: FacebookClient, useValue: { configured: true } },
        { provide: InstagramClient, useValue: { configured: false } },
      ],
    }).compile();

    await moduleRef.get(SocialPublishingService).enqueueDueArticles();

    const rows = prisma.socialPost.createMany.mock.calls[0][0].data;
    expect(rows[0].message).toHaveLength(301);
    expect(rows[0].message.endsWith('…')).toBe(true);
  });
});
