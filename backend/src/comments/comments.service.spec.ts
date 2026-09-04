import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommentsService, type ActingStaff } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { CommentMailService } from './comment-mail.service';

function makePrismaMock() {
  return {
    comment: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    article: { update: jest.fn(), findUnique: jest.fn() },
  };
}

const STAFF: ActingStaff = { id: 'u1', email: 'mod@opatriota.pt', name: 'Mod' };

/**
 * The rules the client asked for by voice, made concrete: approving a
 * comment mails its author with the comment itself; removing one requires
 * a reason and mails that reason to the author; nothing is ever mailed
 * for the queue-internal statuses (REJEITADO/SPAM); and a "permanent"
 * delete is a second, separate, guarded step — never a side effect of the
 * first.
 */
describe('CommentsService — moderate() and hardDelete()', () => {
  let service: CommentsService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let mail: { sendApproved: jest.Mock; sendRemoved: jest.Mock };

  const EXISTING = {
    id: 'c1',
    body: 'Texto do comentário',
    articleId: 'a1',
    article: { title: 'Título do artigo', slug: 'titulo-do-artigo' },
    reader: { email: 'leitor@example.com', name: 'Leitor Um' },
  };

  beforeEach(async () => {
    prisma = makePrismaMock();
    mail = { sendApproved: jest.fn(), sendRemoved: jest.fn() };
    prisma.comment.findUnique.mockResolvedValue(EXISTING);
    prisma.comment.count.mockResolvedValue(0);

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityLogService, useValue: { record: jest.fn() } },
        { provide: CommentMailService, useValue: mail },
      ],
    }).compile();
    service = moduleRef.get(CommentsService);
  });

  describe('moderate()', () => {
    it('mails the author the comment itself on approval', async () => {
      await service.moderate('c1', 'APROVADO', STAFF);

      expect(mail.sendApproved).toHaveBeenCalledWith(
        'leitor@example.com',
        'Leitor Um',
        'Título do artigo',
        'titulo-do-artigo',
        'Texto do comentário',
      );
      expect(mail.sendRemoved).not.toHaveBeenCalled();
    });

    it('mails the author the reason on removal, when one is given', async () => {
      await service.moderate('c1', 'ELIMINADO', STAFF, 'Linguagem ofensiva.');

      expect(mail.sendRemoved).toHaveBeenCalledWith(
        'leitor@example.com',
        'Leitor Um',
        'Título do artigo',
        'Linguagem ofensiva.',
      );
      expect(mail.sendApproved).not.toHaveBeenCalled();
    });

    it('does NOT mail a removal with no reason', async () => {
      await service.moderate('c1', 'ELIMINADO', STAFF);

      expect(mail.sendRemoved).not.toHaveBeenCalled();
      expect(mail.sendApproved).not.toHaveBeenCalled();
    });

    it('does not mail anything for REJEITADO or SPAM', async () => {
      await service.moderate('c1', 'REJEITADO', STAFF, 'nota interna');
      await service.moderate('c1', 'SPAM', STAFF);

      expect(mail.sendApproved).not.toHaveBeenCalled();
      expect(mail.sendRemoved).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing comment', async () => {
      prisma.comment.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.moderate('missing', 'APROVADO', STAFF),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('hardDelete()', () => {
    function withStatusAndReplies(status: string, replies: number) {
      prisma.comment.findUnique.mockResolvedValueOnce({
        id: 'c1',
        status,
        articleId: 'a1',
        body: 'Texto do comentário',
        article: { title: 'Título do artigo' },
        _count: { replies },
      });
    }

    it('refuses a comment that was never soft-deleted first', async () => {
      withStatusAndReplies('PENDENTE', 0);
      await expect(service.hardDelete('c1', STAFF)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.comment.delete).not.toHaveBeenCalled();
    });

    it('refuses an ELIMINADO comment that still has replies', async () => {
      withStatusAndReplies('ELIMINADO', 2);
      await expect(service.hardDelete('c1', STAFF)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.comment.delete).not.toHaveBeenCalled();
    });

    it('deletes an ELIMINADO, reply-free comment', async () => {
      withStatusAndReplies('ELIMINADO', 0);
      const result = await service.hardDelete('c1', STAFF);

      expect(prisma.comment.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
      expect(result).toEqual({ id: 'c1' });
    });

    it('throws NotFoundException for a missing comment', async () => {
      prisma.comment.findUnique.mockResolvedValueOnce(null);
      await expect(service.hardDelete('missing', STAFF)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
