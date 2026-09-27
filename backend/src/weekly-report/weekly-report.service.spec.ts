import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { ReadersService } from '../readers/readers.service';
import { VisitsService } from '../visits/visits.service';
import { WeeklyReportService } from './weekly-report.service';

function readerStatsFixture() {
  return {
    subscriptions: {
      active: 2,
      free: 3,
      newRecently: 2,
      newWindowDays: 30,
      cancelledRecently: 0,
      cancelledWindowDays: 30,
    },
  };
}

describe('WeeklyReportService', () => {
  let service: WeeklyReportService;
  let prisma: {
    user: { findMany: jest.Mock; count: jest.Mock };
    article: { count: jest.Mock };
    package: { count: jest.Mock };
    rolePermissions: { count: jest.Mock };
  };
  let mailer: { sendOrThrow: jest.Mock; siteName: jest.Mock; siteUrl: jest.Mock };
  let readers: { getStats: jest.Mock };
  let visits: { getCounts: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn(), count: jest.fn().mockResolvedValue(9) },
      article: { count: jest.fn().mockResolvedValue(1) },
      package: { count: jest.fn().mockResolvedValue(0) },
      rolePermissions: { count: jest.fn().mockResolvedValue(0) },
    };
    mailer = {
      sendOrThrow: jest.fn().mockResolvedValue({ messageId: 'm1' }),
      siteName: jest.fn().mockResolvedValue('O Patriota'),
      siteUrl: jest.fn().mockReturnValue('https://opatriota.pt'),
    };
    readers = { getStats: jest.fn().mockResolvedValue(readerStatsFixture()) };
    visits = {
      getCounts: jest.fn().mockResolvedValue({ today: 1, week: 10, month: 40 }),
    };

    const module = await Test.createTestingModule({
      providers: [
        WeeklyReportService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailerService, useValue: mailer },
        { provide: ReadersService, useValue: readers },
        { provide: VisitsService, useValue: visits },
      ],
    }).compile();

    service = module.get(WeeklyReportService);
  });

  it('sends only to SUPER_ADMIN/EDITOR_CHEFE who did not opt out', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'admin@x.pt', name: 'Admin', notificationPrefs: {} },
      {
        id: 'u2',
        email: 'chefe@x.pt',
        name: 'Chefe',
        notificationPrefs: { weeklyReport: false },
      },
    ]);

    const sent = await service.send(new Date('2026-09-28T08:00:00Z'));

    expect(sent).toBe(1);
    expect(mailer.sendOrThrow).toHaveBeenCalledTimes(1);
    expect(mailer.sendOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@x.pt', tag: 'weekly-report' }),
    );
  });

  it('treats an absent key as opted in', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'admin@x.pt', name: null, notificationPrefs: {} },
    ]);

    await service.send();

    expect(mailer.sendOrThrow).toHaveBeenCalledTimes(1);
  });

  it('sends nothing and never touches stats when everyone opted out', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        email: 'admin@x.pt',
        name: null,
        notificationPrefs: { weeklyReport: false },
      },
    ]);

    const sent = await service.send();

    expect(sent).toBe(0);
    expect(mailer.sendOrThrow).not.toHaveBeenCalled();
    expect(readers.getStats).not.toHaveBeenCalled();
  });

  it('queries recipients scoped to the reporting roles and active accounts', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await service.send();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: { in: ['SUPER_ADMIN', 'EDITOR_CHEFE'] }, isActive: true },
      }),
    );
  });

  it('never throws when the mailer rejects for one recipient', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'a@x.pt', name: null, notificationPrefs: {} },
      { id: 'u2', email: 'b@x.pt', name: null, notificationPrefs: {} },
    ]);
    mailer.sendOrThrow
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce({ messageId: 'm2' });

    const sent = await service.send();

    expect(sent).toBe(1);
  });
});
