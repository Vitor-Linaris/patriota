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
      count: jest.fn().mockResolvedValue(42),
      create: jest.fn(),
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

  it('subscribe lower-cases the email and surfaces duplicate as Conflict', async () => {
    prisma.newsletterSubscriber.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.subscribe('A@X.PT')).rejects.toThrow(ConflictException);
    expect(prisma.newsletterSubscriber.create.mock.calls[0][0].data.email).toBe(
      'a@x.pt',
    );
  });
});
