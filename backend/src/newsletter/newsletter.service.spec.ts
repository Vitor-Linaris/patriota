import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { MailerService } from '../mailer/mailer.service';

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
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('NewsletterService', () => {
  let service: NewsletterService;
  let prisma: ReturnType<typeof makePrisma>;
  let mailer: { send: jest.Mock; siteName: jest.Mock; siteUrl: jest.Mock };
  let activity: { record: jest.Mock };

  beforeEach(async () => {
    prisma = makePrisma();
    mailer = {
      send: jest.fn().mockResolvedValue(null),
      siteName: jest.fn().mockResolvedValue('O Patriota'),
      siteUrl: jest.fn().mockReturnValue('https://opatriota.pt'),
    };
    activity = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        NewsletterService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityLogService, useValue: activity },
        { provide: MailerService, useValue: mailer },
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
    prisma.newsletterSubscriber.create.mockResolvedValueOnce({
      manageToken: 'tok',
    });
    await service.subscribe('A@X.PT');
    expect(prisma.newsletterSubscriber.findUnique.mock.calls[0][0].where).toEqual(
      { email: 'a@x.pt' },
    );
    expect(prisma.newsletterSubscriber.create.mock.calls[0][0].data.email).toBe(
      'a@x.pt',
    );
  });

  it('answers a subscribed address exactly as it answers a new one', async () => {
    // The 409 "este e-mail já está subscrito" made the public form a
    // free membership oracle: type an address, read the answer, learn
    // whether that person reads this newspaper. Its own sibling masks
    // that same fact on purpose.
    prisma.newsletterSubscriber.findUnique.mockResolvedValueOnce({
      id: 's1',
      status: 'ATIVO',
      name: '',
      manageToken: 'tok',
    });

    await expect(service.subscribe('A@X.PT')).resolves.toEqual({ ok: true });
    expect(prisma.newsletterSubscriber.create).not.toHaveBeenCalled();
    expect(prisma.newsletterSubscriber.update).not.toHaveBeenCalled();
  });

  it('never puts a CANCELADO address back on the list from the public form', async () => {
    // The one deliberate act a person took to stop hearing from this
    // newspaper could be undone by any stranger who knew the address.
    prisma.newsletterSubscriber.findUnique.mockResolvedValueOnce({
      id: 's1',
      status: 'CANCELADO',
      name: 'Old',
      manageToken: 'tok',
    });

    await expect(service.subscribe('A@X.PT', 'New')).resolves.toEqual({
      ok: true,
    });
    expect(prisma.newsletterSubscriber.update).not.toHaveBeenCalled();
    expect(prisma.newsletterSubscriber.create).not.toHaveBeenCalled();
    // They are offered the way back, in the inbox that owns the address.
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@x.pt' }),
    );
  });

  it('lifts INATIVO, which is an operational state and not a decision', async () => {
    prisma.newsletterSubscriber.findUnique.mockResolvedValueOnce({
      id: 's1',
      status: 'INATIVO',
      name: 'Old',
      manageToken: 'tok',
    });
    prisma.newsletterSubscriber.update.mockResolvedValueOnce({});

    await service.subscribe('A@X.PT', 'New');

    expect(prisma.newsletterSubscriber.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'ATIVO', name: 'New' },
    });
  });

  describe('cancelling', () => {
    it('cancels nothing on the strength of a typed address', async () => {
      // THE finding. The e-mail in the request body was the whole
      // authorisation, so anybody could take anybody else off the list,
      // silently, with the endpoint returning success either way.
      prisma.newsletterSubscriber.findUnique.mockResolvedValueOnce({
        name: 'Ana',
        manageToken: 'tok',
        status: 'ATIVO',
      });

      await expect(service.requestManageLink('A@X.PT')).resolves.toEqual({
        ok: true,
      });

      expect(prisma.newsletterSubscriber.update).not.toHaveBeenCalled();
      expect(prisma.newsletterSubscriber.updateMany).not.toHaveBeenCalled();
      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@x.pt' }),
      );
    });

    it('stays silent about an address that is not on the list', async () => {
      prisma.newsletterSubscriber.findUnique.mockResolvedValueOnce(null);

      await expect(service.requestManageLink('nobody@x.pt')).resolves.toEqual({
        ok: true,
      });
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('cancels on the token, which only the owner of the inbox has', async () => {
      await service.unsubscribeByToken('tok');

      expect(prisma.newsletterSubscriber.updateMany).toHaveBeenCalledWith({
        where: { manageToken: 'tok' },
        data: { status: 'CANCELADO' },
      });
    });
  });

  describe('erasure', () => {
    it('deletes the row rather than marking it', async () => {
      // CANCELADO is a suppression record and has to survive. "Forget
      // me" is a different request, and this table could not honour it
      // at all — no delete path, public or admin, and no relation to
      // Reader for the reader-side erasure to reach.
      await service.forget('tok');

      expect(prisma.newsletterSubscriber.deleteMany).toHaveBeenCalledWith({
        where: { manageToken: 'tok' },
      });
    });

    it('keeps the erased address out of the audit trail', async () => {
      prisma.newsletterSubscriber.findUnique.mockResolvedValueOnce({
        id: 's1',
        email: 'ana@x.pt',
      });
      prisma.newsletterSubscriber.delete.mockResolvedValueOnce({});

      await service.removeSubscriber('s1', 'admin');

      const logged = activity.record.mock.calls[0][0] as {
        targetLabel: string;
      };
      // Writing it on the way out would just move the address to
      // another table with no delete path either.
      expect(logged.targetLabel).not.toContain('ana@x.pt');
    });
  });

  it('keeps cancelled addresses out of the export', async () => {
    // An export is how a list leaves this system and arrives somewhere
    // with no memory of who opted out.
    await service.listAllSubscribers();

    expect(prisma.newsletterSubscriber.findMany.mock.calls[0][0].where).toEqual({
      status: { not: 'CANCELADO' },
    });
  });
});
