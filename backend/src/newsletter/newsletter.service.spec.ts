import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

function makePrisma() {
  return {
    newsletterCampaign: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    newsletterSubscriber: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(42),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('NewsletterService', () => {
  let service: NewsletterService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NewsletterService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityLogService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(NewsletterService);
  });

  it('createCampaign sets status AGENDADA when scheduledAt is provided', async () => {
    prisma.newsletterCampaign.create.mockResolvedValueOnce({});
    await service.createCampaign({
      subject: 'X',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(prisma.newsletterCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'AGENDADA' }),
      }),
    );
  });

  it('sendCampaign refuses to send an already-sent campaign', async () => {
    prisma.newsletterCampaign.findUnique.mockResolvedValueOnce({
      id: 'c1',
      status: 'ENVIADA',
    });
    await expect(service.sendCampaign('c1', 'admin')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('subscribe lower-cases the email and creates a fresh row when none exists', async () => {
    prisma.newsletterSubscriber.findUnique.mockResolvedValueOnce(null);
    prisma.newsletterSubscriber.create.mockResolvedValueOnce({ id: 's1' });
    await service.subscribe('A@X.PT');
    expect(prisma.newsletterSubscriber.findUnique).toHaveBeenCalledWith({
      where: { email: 'a@x.pt' },
    });
    expect(prisma.newsletterSubscriber.create.mock.calls[0][0].data.email).toBe(
      'a@x.pt',
    );
  });

  it('subscribe throws Conflict when address is already ATIVO', async () => {
    prisma.newsletterSubscriber.findUnique.mockResolvedValueOnce({
      id: 's1',
      email: 'a@x.pt',
      status: 'ATIVO',
      name: '',
    });
    await expect(service.subscribe('A@X.PT')).rejects.toThrow(ConflictException);
    expect(prisma.newsletterSubscriber.create).not.toHaveBeenCalled();
    expect(prisma.newsletterSubscriber.update).not.toHaveBeenCalled();
  });

  it('subscribe re-activates a previously CANCELADO subscriber', async () => {
    prisma.newsletterSubscriber.findUnique.mockResolvedValueOnce({
      id: 's1',
      email: 'a@x.pt',
      status: 'CANCELADO',
      name: 'Old',
    });
    prisma.newsletterSubscriber.update.mockResolvedValueOnce({ id: 's1' });
    await service.subscribe('A@X.PT', 'New');
    expect(prisma.newsletterSubscriber.update).toHaveBeenCalledWith({
      where: { email: 'a@x.pt' },
      data: { status: 'ATIVO', name: 'New' },
    });
    expect(prisma.newsletterSubscriber.create).not.toHaveBeenCalled();
  });

  it('unsubscribe flips status to CANCELADO and is idempotent', async () => {
    prisma.newsletterSubscriber.update.mockResolvedValueOnce({ id: 's1' });
    await expect(service.unsubscribe('A@X.PT')).resolves.toEqual({ ok: true });
    expect(prisma.newsletterSubscriber.update).toHaveBeenCalledWith({
      where: { email: 'a@x.pt' },
      data: { status: 'CANCELADO' },
    });
    // Unknown address (Prisma P2025) still resolves ok — avoids
    // leaking subscriber membership.
    prisma.newsletterSubscriber.update.mockRejectedValueOnce({ code: 'P2025' });
    await expect(service.unsubscribe('nobody@x.pt')).resolves.toEqual({
      ok: true,
    });
  });
});
