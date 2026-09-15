import { Test } from '@nestjs/testing';
import { ActivityLogService } from './activity-log.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ActivityLogService', () => {
  let service: ActivityLogService;
  let prisma: {
    activityLog: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    user: { findUnique: jest.Mock };
    reader: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      activityLog: {
        create: jest.fn().mockResolvedValue({ id: 'a1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ name: 'Ana Dias', email: 'ana@opatriota.pt' }),
      },
      reader: { findMany: jest.fn().mockResolvedValue([]) },
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
          actorLabel: 'Ana Dias <ana@opatriota.pt>',
          action: 'published',
          targetType: 'article',
          targetId: 'a-123',
          targetLabel: 'Article title',
        },
      });
    });

    it('denormalises the actor label so the entry outlives the account', async () => {
      // userId is onDelete: SetNull, so after the account is deleted the
      // relation is the only thing that named the actor — and it is gone.
      // Without this label the surviving row is unattributable, which is
      // only marginally better than the cascade that used to delete it.
      await service.record({
        userId: 'u1',
        action: 'reader_suspended',
        targetType: 'reader',
        targetLabel: 'leitor@x.pt',
      });
      const data = prisma.activityLog.create.mock.calls[0][0].data;
      expect(data.actorLabel).toContain('ana@opatriota.pt');
    });

    it('still records something attributable when the actor row is gone', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await service.record({
        userId: 'ghost',
        action: 'x',
        targetType: 'article',
        targetLabel: 'x',
      });
      const data = prisma.activityLog.create.mock.calls[0][0].data;
      expect(data.actorLabel).toContain('ghost');
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

    /**
     * The reader's identity is never on the row. Six call sites used to
     * write the address into targetLabel as free text while already
     * storing targetId beside it — and this table has no readerId, so
     * the RGPD erasure transaction had nothing to find and nothing to
     * clear. The address outlived the account that asked to be
     * forgotten and came straight back out of GET /admin/activity.
     */
    const readerRow = {
      id: 'log1',
      targetType: 'reader',
      targetId: 'r1',
      targetLabel: 'permanente',
    };

    it('names a reader from the account, not from the stored row', async () => {
      prisma.activityLog.findMany.mockResolvedValueOnce([readerRow]);
      prisma.reader.findMany.mockResolvedValueOnce([
        { id: 'r1', name: 'Ana', email: 'ana@exemplo.pt' },
      ]);

      const page = await service.list({} as never);

      expect((page.items[0] as { targetLabel: string }).targetLabel).toBe(
        'Ana — permanente',
      );
    });

    it('shows an erased reader as removed, with no sweep of this table', async () => {
      prisma.activityLog.findMany.mockResolvedValueOnce([readerRow]);
      // What anonymise() leaves behind.
      prisma.reader.findMany.mockResolvedValueOnce([
        { id: 'r1', name: null, email: 'anonimizado+r1@invalid.local' },
      ]);

      const page = await service.list({} as never);
      const label = (page.items[0] as { targetLabel: string }).targetLabel;

      expect(label).toBe('Leitor removido — permanente');
      expect(label).not.toContain('invalid.local');
    });

    it('leaves rows that are not about a reader alone', async () => {
      prisma.activityLog.findMany.mockResolvedValueOnce([
        { id: 'l2', targetType: 'article', targetId: 'a1', targetLabel: 'Título' },
      ]);

      const page = await service.list({} as never);

      expect((page.items[0] as { targetLabel: string }).targetLabel).toBe(
        'Título',
      );
      expect(prisma.reader.findMany).not.toHaveBeenCalled();
    });
  });
});
