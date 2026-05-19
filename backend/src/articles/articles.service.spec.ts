import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { RbacService } from '../rbac/rbac.service';

function makePrismaMock() {
  return {
    article: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    category: { findUnique: jest.fn() },
  };
}

describe('ArticlesService', () => {
  let service: ArticlesService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let activity: { record: jest.Mock };
  let rbac: { getPermissionsForRole: jest.Mock };

  beforeEach(async () => {
    prisma = makePrismaMock();
    activity = { record: jest.fn() };
    rbac = { getPermissionsForRole: jest.fn().mockResolvedValue([]) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ArticlesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityLogService, useValue: activity },
        { provide: RbacService, useValue: rbac },
      ],
    }).compile();
    service = moduleRef.get(ArticlesService);
  });

  describe('create()', () => {
    it('auto-derives slug from title and persists with the author', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'cat1' });
      prisma.article.create.mockResolvedValueOnce({ id: 'a1', slug: 'governo-anuncia' });
      await service.create(
        { title: 'Governo anuncia!', categoryId: 'cat1', content: '<p>x</p>' },
        { id: 'u1', role: 'EDITOR' },
      );
      expect(prisma.article.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: 'governo-anuncia',
          authorId: 'u1',
          status: 'RASCUNHO',
        }),
      });
      expect(activity.record).toHaveBeenCalled();
    });

    it('throws NotFoundException when category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.create(
          { title: 'X', categoryId: 'missing', content: '' },
          { id: 'u1', role: 'EDITOR' },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('publish()', () => {
    it('sets status PUBLICADO and publishedAt; requires artigos.publicar', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce(['artigos.publicar']);
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1', authorId: 'u1', status: 'RASCUNHO',
      });
      prisma.article.update.mockResolvedValueOnce({ id: 'a1', status: 'PUBLICADO' });

      await service.publish('a1', { id: 'u2', role: 'EDITOR_CHEFE' });
      const updateArgs = prisma.article.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 'a1' });
      expect(updateArgs.data.status).toBe('PUBLICADO');
      expect(updateArgs.data.publishedAt).toBeInstanceOf(Date);
      expect(updateArgs.data.rejectionReason).toBeNull();
    });

    it('forbids users without artigos.publicar and no artigos.submeter', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce([]);
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1', authorId: 'u1', status: 'RASCUNHO',
      });
      await expect(
        service.publish('a1', { id: 'u2', role: 'JORNALISTA' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('falls back to submitForReview when caller has submeter but not publicar', async () => {
      // First call: publish() perms check
      rbac.getPermissionsForRole.mockResolvedValueOnce([
        'artigos.submeter',
        'artigos.editar_proprios',
      ]);
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1', authorId: 'u1', status: 'RASCUNHO',
      });
      // Second call: assertCanEdit inside submitForReview
      rbac.getPermissionsForRole.mockResolvedValueOnce([
        'artigos.editar_proprios',
      ]);
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1', authorId: 'u1', status: 'RASCUNHO',
      });
      prisma.article.update.mockResolvedValueOnce({
        id: 'a1', status: 'EM_REVISAO',
      });

      await service.publish('a1', { id: 'u1', role: 'JORNALISTA' });

      const updateArgs = prisma.article.update.mock.calls[0][0];
      expect(updateArgs.data.status).toBe('EM_REVISAO');
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'submitted_for_review' }),
      );
    });
  });

  describe('submitForReview()', () => {
    it('moves RASCUNHO → EM_REVISAO and logs activity', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce([
        'artigos.editar_proprios',
      ]);
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1', authorId: 'u1', status: 'RASCUNHO',
      });
      prisma.article.update.mockResolvedValueOnce({ id: 'a1', status: 'EM_REVISAO' });

      await service.submitForReview('a1', { id: 'u1', role: 'JORNALISTA' });

      const args = prisma.article.update.mock.calls[0][0];
      expect(args.data.status).toBe('EM_REVISAO');
      expect(args.data.rejectionReason).toBeNull();
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'submitted_for_review' }),
      );
    });

    it('refuses to submit articles already PUBLICADO', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce([
        'artigos.editar_proprios',
      ]);
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1', authorId: 'u1', status: 'PUBLICADO',
      });
      await expect(
        service.submitForReview('a1', { id: 'u1', role: 'JORNALISTA' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('persists scheduledAt when provided', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce([
        'artigos.editar_proprios',
      ]);
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1', authorId: 'u1', status: 'RASCUNHO',
      });
      prisma.article.update.mockResolvedValueOnce({ id: 'a1' });
      const when = '2026-06-01T10:00:00.000Z';
      await service.submitForReview(
        'a1',
        { id: 'u1', role: 'JORNALISTA' },
        { scheduledAt: when },
      );
      const args = prisma.article.update.mock.calls[0][0];
      expect(args.data.scheduledAt).toEqual(new Date(when));
    });
  });

  describe('reject()', () => {
    it('moves EM_REVISAO → RASCUNHO and stores the reason', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce(['artigos.aprovar']);
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1', authorId: 'u1', status: 'EM_REVISAO', title: 'X',
      });
      prisma.article.update.mockResolvedValueOnce({ id: 'a1' });

      await service.reject(
        'a1',
        { id: 'u2', role: 'EDITOR_CHEFE' },
        'Faltam fontes',
      );

      const args = prisma.article.update.mock.calls[0][0];
      expect(args.data.status).toBe('RASCUNHO');
      expect(args.data.rejectionReason).toBe('Faltam fontes');
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'rejected',
          targetLabel: expect.stringContaining('Faltam fontes'),
        }),
      );
    });

    it('forbids users without artigos.aprovar', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce([
        'artigos.editar_proprios',
      ]);
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1', authorId: 'u1', status: 'EM_REVISAO',
      });
      await expect(
        service.reject('a1', { id: 'u3', role: 'JORNALISTA' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses to reject articles not in EM_REVISAO', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce(['artigos.aprovar']);
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1', authorId: 'u1', status: 'RASCUNHO',
      });
      await expect(
        service.reject('a1', { id: 'u2', role: 'EDITOR_CHEFE' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update()', () => {
    it('allows editar_proprios when the user is the author', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce(['artigos.editar_proprios']);
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1', authorId: 'u1', status: 'RASCUNHO',
      });
      prisma.article.update.mockResolvedValueOnce({ id: 'a1' });
      await expect(
        service.update('a1', { title: 'New' }, { id: 'u1', role: 'JORNALISTA' }),
      ).resolves.toBeDefined();
    });

    it('forbids editar_proprios when not the author', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce(['artigos.editar_proprios']);
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1', authorId: 'OTHER', status: 'RASCUNHO',
      });
      await expect(
        service.update('a1', { title: 'New' }, { id: 'u1', role: 'JORNALISTA' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows editar_todos regardless of author', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce(['artigos.editar_todos']);
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1', authorId: 'OTHER', status: 'RASCUNHO',
      });
      prisma.article.update.mockResolvedValueOnce({ id: 'a1' });
      await expect(
        service.update('a1', { title: 'New' }, { id: 'u1', role: 'EDITOR' }),
      ).resolves.toBeDefined();
    });
  });

  describe('essentials / context / pullQuote', () => {
    it('persists the new structured fields when provided', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'cat1' });
      prisma.article.create.mockResolvedValueOnce({ id: 'a1' });
      await service.create(
        {
          title: 'Artigo com caixas',
          categoryId: 'cat1',
          essentials: ['Ponto 1', 'Ponto 2'],
          context: {
            columns: [
              { label: 'O que aconteceu', body: 'Resumo.' },
              { label: 'Porque importa', body: 'Impacto.' },
            ],
          } as never,
          pullQuote: { quote: 'Frase de impacto', cite: 'Fulano' } as never,
        },
        { id: 'u1', role: 'EDITOR' },
      );
      const data = prisma.article.create.mock.calls[0][0].data;
      expect(data.essentials).toEqual(['Ponto 1', 'Ponto 2']);
      expect(data.context).toMatchObject({ columns: expect.any(Array) });
      expect(data.pullQuote).toMatchObject({ quote: expect.any(String) });
    });

    it('stores null when the structured fields are omitted', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'cat1' });
      prisma.article.create.mockResolvedValueOnce({ id: 'a1' });
      await service.create(
        { title: 'Artigo simples', categoryId: 'cat1' },
        { id: 'u1', role: 'EDITOR' },
      );
      const data = prisma.article.create.mock.calls[0][0].data;
      expect(data.essentials).toEqual([]);
      expect(data.context).toBeNull();
      expect(data.pullQuote).toBeNull();
    });
  });

  describe('findPublicBySlug()', () => {
    it('returns only PUBLICADO articles', async () => {
      prisma.article.findFirst.mockResolvedValueOnce(null);
      await expect(service.findPublicBySlug('missing')).rejects.toThrow(NotFoundException);
      expect(prisma.article.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'missing', status: 'PUBLICADO' },
        }),
      );
    });
  });

  describe('listPublic()', () => {
    it('orders by publishedAt desc by default', async () => {
      prisma.article.findMany.mockResolvedValueOnce([]);
      prisma.article.count.mockResolvedValueOnce(0);
      await service.listPublic({} as never);
      const args = prisma.article.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ publishedAt: 'desc' });
      expect(args.where).toMatchObject({ status: 'PUBLICADO' });
    });

    it('orders by views desc when sort=views is given', async () => {
      prisma.article.findMany.mockResolvedValueOnce([]);
      prisma.article.count.mockResolvedValueOnce(0);
      await service.listPublic({ sort: 'views' } as never);
      const args = prisma.article.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ views: 'desc' });
    });
  });

  describe('findRelated()', () => {
    it('returns [] when the reference slug does not exist', async () => {
      prisma.article.findUnique.mockResolvedValueOnce(null);
      await expect(service.findRelated('missing')).resolves.toEqual([]);
      expect(prisma.article.findMany).not.toHaveBeenCalled();
    });

    it('excludes the reference article and only returns PUBLICADO from the same category', async () => {
      prisma.article.findUnique.mockResolvedValueOnce({ id: 'a1', categoryId: 'cat1' });
      prisma.article.findMany.mockResolvedValueOnce([{ id: 'a2' }, { id: 'a3' }]);
      await service.findRelated('some-slug', 4);
      const args = prisma.article.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        status: 'PUBLICADO',
        categoryId: 'cat1',
        NOT: { id: 'a1' },
      });
      expect(args.take).toBe(4);
    });

    it('clamps limit between 1 and 10', async () => {
      prisma.article.findUnique.mockResolvedValue({ id: 'a1', categoryId: 'cat1' });
      prisma.article.findMany.mockResolvedValue([]);
      await service.findRelated('s', 99);
      expect(prisma.article.findMany.mock.calls[0][0].take).toBe(10);
      await service.findRelated('s', 0);
      expect(prisma.article.findMany.mock.calls[1][0].take).toBe(1);
    });
  });
});
