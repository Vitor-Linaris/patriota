import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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

const entry = (over: Record<string, unknown> = {}) => ({
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

  const active = { id: 'r1', email: 'a@x.pt', name: 'Ana', status: 'ATIVO' };
  const updated = {
    id: 'r1',
    email: 'a@x.pt',
    name: 'Ana',
    status: 'SUSPENSO',
    suspendedUntil: null,
    suspensionReason: null,
    suspendedBy: null,
  };

  describe('suspend()', () => {
    it('writes a line in the history, with who did it', async () => {
      // actorLabel is stored rather than joined later, for the same
      // reason ActivityLog does it: the record of who moderated has to
      // outlive the moderator's account.
      prisma.reader.findUnique.mockResolvedValue(active);
      prisma.reader.update.mockResolvedValue(updated);

      await service.suspend('r1', 'DIAS_15', staff, { reason: '  Insultos  ' });

      const data = prisma.readerSanction.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        readerId: 'r1',
        kind: 'SUSPENSAO',
        reason: 'Insultos',
        actorId: 'u1',
        actorLabel: 'Ana <ana@opatriota.pt>',
      });
      // A timed ban carries its end date; the history shows it.
      expect(data.until).toBeInstanceOf(Date);
    });

    it('records a definitive ban as PERMANENTE, with no end date', async () => {
      prisma.reader.findUnique.mockResolvedValue(active);
      prisma.reader.update.mockResolvedValue(updated);

      await service.suspend('r1', 'PERMANENTE', staff);

      expect(prisma.readerSanction.create.mock.calls[0][0].data).toMatchObject({
        kind: 'PERMANENTE',
        until: null,
      });
    });
  });

  describe('unsuspend()', () => {
    it('records the lifting too', async () => {
      // A history that hides the liftings reads as a newsroom that never
      // changes its mind.
      prisma.reader.findUnique.mockResolvedValue({
        ...active,
        status: 'SUSPENSO',
        emailVerifiedAt: new Date(),
      });
      prisma.reader.update.mockResolvedValue(updated);

      await service.unsuspend('r1', staff);

      expect(prisma.readerSanction.create.mock.calls[0][0].data).toMatchObject({
        kind: 'LEVANTAMENTO',
        actorId: 'u1',
      });
    });
  });

  describe('historyOf()', () => {
    const present = () =>
      prisma.reader.findUnique.mockResolvedValue({ id: 'r1' });

    it('escalates with each suspension', async () => {
      // The whole point of the feature: the same two clicks should not
      // mean the same thing on somebody's first bad day and their
      // fourth.
      const cases: [number, string][] = [
        [0, 'DIAS_15'],
        [1, 'DIAS_30'],
        [2, 'PERMANENTE'],
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
      expect(out.suggested).toBe('DIAS_30');
      // …but it is still SHOWN, for the reason above.
      expect(out.entries).toHaveLength(2);
    });

    it('marks a definitive suspension apart from a timed one', async () => {
      // "Já foi suspenso 3 vezes · incluindo uma suspensão definitiva"
      // is a different sentence from three fifteen-day bans, and it is
      // the one that tells a moderator there is nothing left to escalate
      // to.
      present();
      prisma.readerSanction.findMany.mockResolvedValueOnce([
        entry({ id: 'a', kind: 'SUSPENSAO' }),
        entry({ id: 'b', kind: 'SUSPENSAO' }),
        entry({ id: 'c', kind: 'PERMANENTE' }),
      ]);

      await expect(service.historyOf('r1')).resolves.toMatchObject({
        total: 3,
        permanent: 1,
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

    it('refuses a reader that does not exist', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce(null);
      await expect(service.historyOf('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
