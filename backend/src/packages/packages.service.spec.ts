import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PackagesService } from './packages.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { RbacService } from '../rbac/rbac.service';
import { ArticlesService } from '../articles/articles.service';
import { PackageStripeService } from './package-stripe.service';

const member = (
  id: string,
  status: string,
  exclusive = false,
  title = id,
) => ({ article: { id, title, status, exclusive } });

describe('PackagesService', () => {
  let service: PackagesService;
  let prisma: {
    package: Record<string, jest.Mock>;
    packageArticle: Record<string, jest.Mock>;
    packagePurchase: Record<string, jest.Mock>;
    packagePurchaseItem: Record<string, jest.Mock>;
    article: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let articles: { publish: jest.Mock };
  let stripe: { sync: jest.Mock };
  let rbac: { getPermissionsForRole: jest.Mock };

  const editor = { id: 'u1', role: 'EDITOR' as const };

  beforeEach(async () => {
    prisma = {
      package: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'p1', name: 'Pacote' }),
        delete: jest.fn(),
      },
      packageArticle: { deleteMany: jest.fn(), createMany: jest.fn() },
      packagePurchase: { count: jest.fn().mockResolvedValue(0) },
      packagePurchaseItem: { createMany: jest.fn(), deleteMany: jest.fn() },
      article: { findMany: jest.fn(), updateMany: jest.fn() },
      // Array form only — setArticles passes an array of promises.
      $transaction: jest.fn().mockResolvedValue([]),
    };
    articles = { publish: jest.fn().mockResolvedValue({}) };
    stripe = {
      sync: jest.fn().mockResolvedValue({ productId: 'prod_1', priceId: 'price_1' }),
    };
    rbac = {
      getPermissionsForRole: jest
        .fn()
        .mockResolvedValue(['artigos.publicar']),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PackagesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityLogService, useValue: { record: jest.fn() } },
        { provide: RbacService, useValue: rbac },
        { provide: ArticlesService, useValue: articles },
        { provide: PackageStripeService, useValue: stripe },
      ],
    }).compile();
    service = moduleRef.get(PackagesService);
  });

  describe('setArticles()', () => {
    const pkg = { id: 'p1', name: 'Pacote', status: 'RASCUNHO' };

    beforeEach(() => {
      prisma.package.findUnique.mockResolvedValue(pkg);
      // findOneForAdmin runs at the end; give it something.
      prisma.package.findUnique.mockResolvedValue({ ...pkg, items: [] });
    });

    it('accepts drafts — that is the whole point of the feature', async () => {
      prisma.article.findMany.mockResolvedValueOnce([
        { id: 'a1', title: 'Um', status: 'RASCUNHO' },
        { id: 'a2', title: 'Dois', status: 'PUBLICADO' },
      ]);
      await service.setArticles('p1', { articleIds: ['a1', 'a2'] }, editor);
      expect(prisma.packageArticle.createMany).toHaveBeenCalledWith({
        data: [
          { packageId: 'p1', articleId: 'a1', position: 0 },
          { packageId: 'p1', articleId: 'a2', position: 1 },
        ],
      });
    });

    it('refuses archived and scheduled articles, naming them', async () => {
      prisma.article.findMany.mockResolvedValueOnce([
        { id: 'a1', title: 'Arquivado', status: 'ARQUIVADO' },
        { id: 'a2', title: 'Agendado', status: 'AGENDADO' },
      ]);
      // The picker filters these out too, but that is convenience. This is
      // the rule, and it has to name what it refused or the editor is left
      // guessing which of twenty rows is the problem.
      await expect(
        service.setArticles('p1', { articleIds: ['a1', 'a2'] }, editor),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.packageArticle.createMany).not.toHaveBeenCalled();
    });

    it('never writes a purchase item — snapshots live in another table', async () => {
      prisma.article.findMany.mockResolvedValueOnce([
        { id: 'a1', title: 'Um', status: 'RASCUNHO' },
      ]);
      await service.setArticles('p1', { articleIds: ['a1'] }, editor);
      // The entire promise of the feature. If this ever fails, editing a
      // pacote starts rewriting what people already paid for.
      expect(prisma.packagePurchaseItem.createMany).not.toHaveBeenCalled();
      expect(prisma.packagePurchaseItem.deleteMany).not.toHaveBeenCalled();
    });

    it('dedupes while keeping the editor order', async () => {
      prisma.article.findMany.mockResolvedValueOnce([
        { id: 'a1', title: 'Um', status: 'RASCUNHO' },
        { id: 'a2', title: 'Dois', status: 'RASCUNHO' },
      ]);
      await service.setArticles(
        'p1',
        { articleIds: ['a2', 'a1', 'a2'] },
        editor,
      );
      expect(prisma.packageArticle.createMany).toHaveBeenCalledWith({
        data: [
          { packageId: 'p1', articleId: 'a2', position: 0 },
          { packageId: 'p1', articleId: 'a1', position: 1 },
        ],
      });
    });
  });

  describe('publish()', () => {
    const withMembers = (items: unknown[], over: object = {}) => ({
      id: 'p1',
      name: 'Pacote',
      status: 'RASCUNHO',
      priceCents: 990,
      publishedAt: null,
      items,
      ...over,
    });

    it('publishes the drafts AND makes exactly those exclusive', async () => {
      prisma.package.findUnique.mockResolvedValue(
        withMembers([
          member('a1', 'RASCUNHO'),
          member('a2', 'EM_REVISAO'),
          // Already live and already exclusive: nothing to do to it.
          member('a3', 'PUBLICADO', true),
        ]),
      );
      await service.publish('p1', editor);

      expect(articles.publish).toHaveBeenCalledTimes(2);
      expect(articles.publish).toHaveBeenCalledWith('a1', editor);
      expect(articles.publish).toHaveBeenCalledWith('a2', editor);
      expect(prisma.article.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a1', 'a2'] } },
        data: { exclusive: true },
      });
    });

    it('does NOT convert a member that was already live and free', async () => {
      prisma.package.findUnique.mockResolvedValue(
        withMembers([
          member('a1', 'RASCUNHO'),
          member('a2', 'PUBLICADO', false),
        ]),
      );
      await service.publish('p1', editor);

      // a2 must be absent. Putting a free article behind a paywall removes
      // from public view something anybody could read yesterday; that needs
      // an explicit "Tornar exclusivos", not a side effect of publishing.
      const call = prisma.article.updateMany.mock.calls[0][0];
      expect(call.where.id.in).toEqual(['a1']);
      expect(articles.publish).not.toHaveBeenCalledWith('a2', editor);
    });

    it('refuses, and publishes NOTHING, without artigos.publicar', async () => {
      rbac.getPermissionsForRole.mockResolvedValue(['pacotes.publicar']);
      prisma.package.findUnique.mockResolvedValue(
        withMembers([member('a1', 'RASCUNHO', false, 'A minha peça')]),
      );

      await expect(service.publish('p1', editor)).rejects.toThrow(
        ForbiddenException,
      );
      // The check runs BEFORE the first write precisely so a refusal leaves
      // nothing half-done — this flow cannot be one transaction, because
      // ArticlesService.publish() runs its own queries.
      expect(articles.publish).not.toHaveBeenCalled();
      expect(prisma.article.updateMany).not.toHaveBeenCalled();
      expect(stripe.sync).not.toHaveBeenCalled();
      expect(prisma.package.update).not.toHaveBeenCalled();
    });

    it('lets SUPER_ADMIN through without consulting the matrix', async () => {
      prisma.package.findUnique.mockResolvedValue(
        withMembers([member('a1', 'RASCUNHO')]),
      );
      await service.publish('p1', { id: 'u0', role: 'SUPER_ADMIN' });
      expect(rbac.getPermissionsForRole).not.toHaveBeenCalled();
      expect(articles.publish).toHaveBeenCalledWith('a1', {
        id: 'u0',
        role: 'SUPER_ADMIN',
      });
    });

    it('refuses an empty pacote and a pacote with no price', async () => {
      prisma.package.findUnique.mockResolvedValue(withMembers([]));
      await expect(service.publish('p1', editor)).rejects.toThrow(
        BadRequestException,
      );

      prisma.package.findUnique.mockResolvedValue(
        withMembers([member('a1', 'RASCUNHO')], { priceCents: 0 }),
      );
      await expect(service.publish('p1', editor)).rejects.toThrow(
        BadRequestException,
      );
      expect(articles.publish).not.toHaveBeenCalled();
    });

    it('refuses a scheduled member rather than racing its own scheduler', async () => {
      prisma.package.findUnique.mockResolvedValue(
        withMembers([member('a1', 'AGENDADO', false, 'Agendado')]),
      );
      await expect(service.publish('p1', editor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('keeps the original publishedAt when republishing', async () => {
      const first = new Date('2026-01-01T00:00:00Z');
      prisma.package.findUnique.mockResolvedValue(
        withMembers([member('a1', 'PUBLICADO', true)], { publishedAt: first }),
      );
      await service.publish('p1', editor);
      expect(prisma.package.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'PUBLICADO', publishedAt: first },
        }),
      );
    });
  });

  describe('remove()', () => {
    it('refuses to delete a pacote somebody paid for', async () => {
      prisma.package.findUnique.mockResolvedValue({ id: 'p1', name: 'Pacote' });
      prisma.packagePurchase.count.mockResolvedValueOnce(3);
      await expect(service.remove('p1', editor)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.package.delete).not.toHaveBeenCalled();
    });
  });

  describe('makeMembersExclusive()', () => {
    it('touches only live members that are still free', async () => {
      prisma.package.findUnique.mockResolvedValue({
        id: 'p1',
        name: 'Pacote',
        status: 'PUBLICADO',
        priceCents: 990,
        publishedAt: new Date(),
        items: [
          member('a1', 'PUBLICADO', false),
          member('a2', 'PUBLICADO', true),
          member('a3', 'RASCUNHO', false),
        ],
      });
      await service.makeMembersExclusive('p1', editor);
      expect(prisma.article.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a1'] } },
        data: { exclusive: true },
      });
    });
  });
});
