import { Test } from '@nestjs/testing';
import { ArticlesScheduler } from './articles.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

describe('ArticlesScheduler', () => {
  let scheduler: ArticlesScheduler;
  let prisma: {
    article: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let activity: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      article: { findMany: jest.fn(), update: jest.fn() },
    };
    activity = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ArticlesScheduler,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityLogService, useValue: activity },
      ],
    }).compile();
    scheduler = moduleRef.get(ArticlesScheduler);
  });

  it('promotes AGENDADO articles whose scheduledAt is past', async () => {
    const past = new Date('2026-05-19T08:00:00Z');
    const now = new Date('2026-05-19T09:00:00Z');
    prisma.article.findMany.mockResolvedValueOnce([
      { id: 'a1', title: 'First', scheduledAt: past, authorId: 'u1' },
      { id: 'a2', title: 'Second', scheduledAt: past, authorId: 'u2' },
    ]);
    prisma.article.update.mockResolvedValue({});

    const count = await scheduler.runDueArticles(now);

    expect(count).toBe(2);
    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'AGENDADO', scheduledAt: { lte: now } },
      }),
    );
    expect(prisma.article.update).toHaveBeenCalledTimes(2);
    const firstUpdate = prisma.article.update.mock.calls[0][0];
    expect(firstUpdate.data.status).toBe('PUBLICADO');
    expect(firstUpdate.data.publishedAt).toEqual(past);
    expect(firstUpdate.data.scheduledAt).toBeNull();
    expect(activity.record).toHaveBeenCalledTimes(2);
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'published_scheduled' }),
    );
  });

  it('does nothing when no articles are due', async () => {
    prisma.article.findMany.mockResolvedValueOnce([]);
    const count = await scheduler.runDueArticles();
    expect(count).toBe(0);
    expect(prisma.article.update).not.toHaveBeenCalled();
  });

  it('a failing update does not abort other promotions', async () => {
    prisma.article.findMany.mockResolvedValueOnce([
      { id: 'bad', title: 'X', scheduledAt: new Date(), authorId: 'u1' },
      { id: 'good', title: 'Y', scheduledAt: new Date(), authorId: 'u2' },
    ]);
    prisma.article.update
      .mockRejectedValueOnce(new Error('row missing'))
      .mockResolvedValueOnce({});
    const count = await scheduler.runDueArticles();
    expect(count).toBe(1);
  });

  it('falls back to `now` when scheduledAt is somehow null', async () => {
    const now = new Date('2026-05-19T10:00:00Z');
    prisma.article.findMany.mockResolvedValueOnce([
      { id: 'a3', title: 'Z', scheduledAt: null, authorId: 'u3' },
    ]);
    prisma.article.update.mockResolvedValueOnce({});
    await scheduler.runDueArticles(now);
    const args = prisma.article.update.mock.calls[0][0];
    expect(args.data.publishedAt).toEqual(now);
  });
});
