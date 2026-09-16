import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReadersService } from './readers.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { CommentsService } from '../comments/comments.service';
import { ReaderMailService } from '../reader-auth/reader-mail.service';

/**
 * The moderation history.
 *
 * `Reader.suspensionReason` holds the reason for the CURRENT suspension
 * and nothing else: lifting clears it, the next suspension writes over
 * it. That is enough to know somebody's state and enough for nothing
 * else — a moderator opening the comment queue had no way to tell a
 * first bad day from a fourth, which is exactly the difference between
 * fifteen days and permanent.
 */
function makePrisma() {
  return {
    reader: { findUnique: jest.fn(), update: jest.fn() },
    readerSanction: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

const entry = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 's1',
  kind: 'SUSPENSAO',
  reason: null,
  until: null,
  actorLabel: 'Ana <ana@opatriota.pt>',
  createdAt: new Date(),
  ...over,
});

describe('ReadersService — histórico de moderação', () => {
  let service: ReadersService;
  let prisma: ReturnType<typeof makePrisma>;

  const staff = { id: 'u1', email: 'ana@opatriota.pt', name: 'Ana' };

  beforeEach(async () => {
    prisma = makePrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReadersService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityLogService, useValue: { record: jest.fn() } },
        { provide: CommentsService, useValue: { purgeByReader: jest.fn() } },
        {
          provide: ReaderMailService,
          useValue: { sendSuspended: jest.fn(), sendUnsuspended: jest.fn() },
        },
      ],
    }).compile();
    service = moduleRef.get(ReadersService);
  });

  describe('warn()', () => {
    it('records the warning and changes nothing about the account', async () => {
      // warn() devolve o histórico no fim, e isso volta a consultar a
      // linha — daí mockResolvedValue e não ...Once.
      prisma.reader.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'ATIVO',
      });

      await service.warn('r1', staff, '  Linguagem ofensiva  ');

      expect(prisma.readerSanction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          readerId: 'r1',
          kind: 'ADVERTENCIA',
          reason: 'Linguagem ofensiva',
          until: null,
          actorId: 'u1',
        }),
      });
      // A warning is a record, not a punishment.
      expect(prisma.reader.update).not.toHaveBeenCalled();
    });

    it('writes who acted, so the line survives their account', async () => {
      // Same reason ActivityLog.actorLabel exists: the record of who
      // moderated has to outlive the moderator's account.
      // warn() devolve o histórico no fim, e isso volta a consultar a
      // linha — daí mockResolvedValue e não ...Once.
      prisma.reader.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'ATIVO',
      });

      await service.warn('r1', staff);

      expect(
        prisma.readerSanction.create.mock.calls[0][0].data.actorLabel,
      ).toBe('Ana <ana@opatriota.pt>');
    });

    it('refuses an anonymised account', async () => {
      // There is nobody behind it to warn, and the row exists only to
      // keep threads readable.
      prisma.reader.findUnique.mockResolvedValueOnce({
        id: 'r1',
        status: 'ANONIMIZADO',
      });

      await expect(service.warn('r1', staff)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.readerSanction.create).not.toHaveBeenCalled();
    });

    it('refuses a reader that does not exist', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce(null);
      await expect(service.warn('nope', staff)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('historyOf()', () => {
    const present = () =>
      prisma.reader.findUnique.mockResolvedValue({ id: 'r1' });

    it('escalates with each offence', async () => {
      // The whole point of the feature: the same two clicks should not
      // mean the same thing on somebody's first bad day and their
      // fourth.
      const cases: [number, string][] = [
        [0, 'ADVERTENCIA'],
        [1, 'DIAS_15'],
        [2, 'DIAS_30'],
        [3, 'PERMANENTE'],
        [9, 'PERMANENTE'],
      ];
      for (const [count, expected] of cases) {
        present();
        prisma.readerSanction.findMany.mockResolvedValueOnce(
          Array.from({ length: count }, (_, i) => entry({ id: `s${i}` })),
        );
        await expect(service.historyOf('r1')).resolves.toMatchObject({
          total: count,
          suggested: expected,
        });
      }
    });

    it('does not count a lifted suspension against the reader', async () => {
      // Somebody undoing a ban is not an offence by the person banned.
      present();
      prisma.readerSanction.findMany.mockResolvedValueOnce([
        entry({ id: 'a', kind: 'SUSPENSAO' }),
        entry({ id: 'b', kind: 'LEVANTAMENTO' }),
      ]);

      const out = await service.historyOf('r1');

      expect(out.total).toBe(1);
      expect(out.suggested).toBe('DIAS_15');
      // …but it is still SHOWN. A history that hides the lifting reads
      // as a newsroom that never changes its mind.
      expect(out.entries).toHaveLength(2);
    });

    it('counts warnings and suspensions apart', async () => {
      present();
      prisma.readerSanction.findMany.mockResolvedValueOnce([
        entry({ id: 'a', kind: 'ADVERTENCIA' }),
        entry({ id: 'b', kind: 'ADVERTENCIA' }),
        entry({ id: 'c', kind: 'PERMANENTE' }),
      ]);

      await expect(service.historyOf('r1')).resolves.toMatchObject({
        total: 3,
        warnings: 2,
        suspensions: 1,
      });
    });

    it('reads newest first', async () => {
      present();
      await service.historyOf('r1');
      expect(prisma.readerSanction.findMany.mock.calls[0][0]).toMatchObject({
        where: { readerId: 'r1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
