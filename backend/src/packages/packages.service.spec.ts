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
import { MediaService } from '../media/media.service';

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
  let media: { promoteForPublication: jest.Mock };

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
    media = { promoteForPublication: jest.fn().mockResolvedValue(1) };
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
        { provide: MediaService, useValue: media },
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

    it('makes the cover image reachable to readers', async () => {
      /*
       * Uploaded media starts PRIVADO and /uploads refuses it to anybody
       * without a session — that is what stops an unpublished
       * investigation's photographs being fetched by whoever guesses the
       * address. Publishing is what lifts it, and every other publish
       * path does this: articles, the scheduler, ads.
       *
       * The pacote publish did not, so the cover of every pacote on sale
       * 404'd for readers while looking perfectly fine in the admin,
       * where the staff session makes a private file visible. Nobody in
       * the newsroom could see the bug from inside the newsroom.
       */
      prisma.package.findUnique.mockResolvedValue(
        withMembers([member('a1', 'PUBLICADO', true)], {
          coverImageUrl: 'http://api/uploads/2026/09/abc123-large.webp',
        }),
      );

      await service.publish('p1', editor);

      expect(media.promoteForPublication).toHaveBeenCalledWith(
        'http://api/uploads/2026/09/abc123-large.webp',
      );
    });

    it('publishes only the drafts, and makes every member exclusive', async () => {
      prisma.package.findUnique.mockResolvedValue(
        withMembers([
          member('a1', 'RASCUNHO'),
          member('a2', 'EM_REVISAO'),
          // Already live and already exclusive.
          member('a3', 'PUBLICADO', true),
        ]),
      );
      await service.publish('p1', editor);

      // Publishing is for the drafts alone — a3 is already out.
      expect(articles.publish).toHaveBeenCalledTimes(2);
      expect(articles.publish).toHaveBeenCalledWith('a1', editor);
      expect(articles.publish).toHaveBeenCalledWith('a2', editor);
      // Closing is for all of them. `exclusive: false` in the where is
      // what keeps a3 out of the write without keeping it out of the
      // rule — it is already closed, so there is nothing to do to it.
      expect(prisma.article.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a1', 'a2', 'a3'] }, exclusive: false },
        data: { exclusive: true },
      });
    });

    it('closes a member that was already live and free', async () => {
      /*
       * This used to assert the opposite — that a live free member was
       * left open, and needed a separate "Tornar exclusivos" click. The
       * reasoning was sound about the danger (closing an article removes
       * from public view something anybody could read yesterday) and
       * wrong about where to put the decision.
       *
       * What it produced was a pacote on sale whose articles were still
       * free at their own URLs: the buyer pays for something anybody can
       * read, and nobody notices until a reader does. Publishing a
       * pacote IS the decision to sell what is in it.
       *
       * The warning moved to the confirmation, which names how many live
       * free articles are about to close BEFORE the click.
       */
      prisma.package.findUnique.mockResolvedValue(
        withMembers([
          member('a1', 'RASCUNHO'),
          member('a2', 'PUBLICADO', false),
        ]),
      );
      await service.publish('p1', editor);

      const call = prisma.article.updateMany.mock.calls[0][0];
      expect(call.where.id.in).toEqual(['a1', 'a2']);
      expect(call.data).toEqual({ exclusive: true });
      // Still only the DRAFT is published — a2 was already live.
      expect(articles.publish).not.toHaveBeenCalledWith('a2', editor);
    });

    it('closes the members even when there was no draft to publish', async () => {
      // A pacote built entirely from articles that were already out.
      // Nothing to publish, and everything to close.
      prisma.package.findUnique.mockResolvedValue(
        withMembers([
          member('a1', 'PUBLICADO', false),
          member('a2', 'PUBLICADO', false),
        ]),
      );

      await service.publish('p1', editor);

      expect(articles.publish).not.toHaveBeenCalled();
      expect(prisma.article.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a1', 'a2'] }, exclusive: false },
        data: { exclusive: true },
      });
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

  describe('assignArticle()', () => {
    beforeEach(() => {
      prisma.article.findUnique = jest.fn().mockResolvedValue({
        id: 'a1',
        title: 'A peça',
        status: 'RASCUNHO',
      });
      prisma.packageArticle.findMany = jest.fn().mockResolvedValue([]);
      prisma.packageArticle.findFirst = jest.fn().mockResolvedValue(null);
      prisma.packageArticle.create = jest.fn();
      prisma.package.findUnique.mockResolvedValue({ id: 'p1', name: 'Pacote' });
      prisma.$transaction = jest.fn((cb: (c: unknown) => unknown) =>
        typeof cb === 'function'
          ? cb({
              packageArticle: {
                deleteMany: prisma.packageArticle.deleteMany,
                findFirst: prisma.packageArticle.findFirst,
                create: prisma.packageArticle.create,
              },
            })
          : Promise.resolve([]),
      );
    });

    it('files a draft into a pacote, appended at the end', async () => {
      prisma.packageArticle.findFirst.mockResolvedValueOnce({ position: 4 });
      await service.assignArticle('a1', 'p1', editor);
      expect(prisma.packageArticle.create).toHaveBeenCalledWith({
        data: { packageId: 'p1', articleId: 'a1', position: 5 },
      });
    });

    it('starts at 0 in an empty pacote', async () => {
      await service.assignArticle('a1', 'p1', editor);
      expect(prisma.packageArticle.create).toHaveBeenCalledWith({
        data: { packageId: 'p1', articleId: 'a1', position: 0 },
      });
    });

    it('takes the article out when packageId is null', async () => {
      prisma.packageArticle.findMany.mockResolvedValueOnce([
        { packageId: 'p1' },
      ]);
      await service.assignArticle('a1', null, editor);
      expect(prisma.packageArticle.deleteMany).toHaveBeenCalledWith({
        where: { articleId: 'a1' },
      });
      expect(prisma.packageArticle.create).not.toHaveBeenCalled();
    });

    it('refuses when the article is in several pacotes', async () => {
      prisma.packageArticle.findMany.mockResolvedValueOnce([
        { packageId: 'p1' },
        { packageId: 'p2' },
      ]);
      // A single <select> cannot express "in two of them", so saving one
      // value would silently drop a pacote somebody deliberately chose on
      // the multi-select screen.
      await expect(service.assignArticle('a1', 'p3', editor)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.packageArticle.deleteMany).not.toHaveBeenCalled();
    });

    it('is a no-op when it is already in that pacote', async () => {
      prisma.packageArticle.findMany.mockResolvedValueOnce([
        { packageId: 'p1' },
      ]);
      await service.assignArticle('a1', 'p1', editor);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses an archived or scheduled article', async () => {
      prisma.article.findUnique.mockResolvedValueOnce({
        id: 'a1',
        title: 'Agendado',
        status: 'AGENDADO',
      });
      await expect(service.assignArticle('a1', 'p1', editor)).rejects.toThrow(
        BadRequestException,
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
