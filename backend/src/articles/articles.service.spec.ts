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
    });

    it('forbids users without artigos.publicar', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce([]);
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1', authorId: 'u1', status: 'RASCUNHO',
      });
      await expect(
        service.publish('a1', { id: 'u2', role: 'JORNALISTA' }),
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
});
