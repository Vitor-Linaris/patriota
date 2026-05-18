import { Test } from '@nestjs/testing';
import { ActivityLogService } from './activity-log.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ActivityLogService', () => {
  let service: ActivityLogService;
  let prisma: { activityLog: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      activityLog: {
        create: jest.fn().mockResolvedValue({ id: 'a1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ActivityLogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(ActivityLogService);
  });

  describe('record()', () => {
    it('persists an activity entry with the given payload', async () => {
      await service.record({
        userId: 'u1',
        action: 'published',
        targetType: 'article',
        targetId: 'a-123',
        targetLabel: 'Article title',
      });
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          action: 'published',
          targetType: 'article',
          targetId: 'a-123',
          targetLabel: 'Article title',
        },
      });
    });

    it('swallows persistence errors so business logic is not blocked', async () => {
      prisma.activityLog.create.mockRejectedValueOnce(new Error('boom'));
      await expect(
        service.record({
          userId: 'u1',
          action: 'x',
          targetType: 'article',
          targetLabel: 'x',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('list()', () => {
    it('returns paginated entries with the user relation included', async () => {
      prisma.activityLog.findMany.mockResolvedValueOnce([
        { id: 'a1', action: 'published', user: { name: 'Ana', role: 'EDITOR' } },
      ]);
      prisma.activityLog.count.mockResolvedValueOnce(1);
      const result = await service.list({ page: 1, pageSize: 10 });
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
        }),
      );
    });
  });
});
