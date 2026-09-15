import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { MediaService } from '../media/media.service';
import { RbacService } from '../rbac/rbac.service';
import { CategoryTreeService } from '../categories/category-tree.service';
import { ConfigService } from '@nestjs/config';
import { PackageAccessService } from '../packages/package-access.service';

function makePrismaMock() {
  return {
    article: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      // Resolves by default because findPublicBySlug fires a
      // view-count increment and forgets it: `void update(...).catch()`.
      // An undefined return has no .catch and would take the paywall
      // tests down for a reason that has nothing to do with them.
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    category: { findUnique: jest.fn() },
  };
}

describe('ArticlesService', () => {
  let service: ArticlesService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let activity: { record: jest.Mock };
  let rbac: {
    getPermissionsForRole: jest.Mock;
    getPermissionsForPlan: jest.Mock;
  };
  let tree: {
    resolveSubtreeIds: jest.Mock;
    resolveSubtreeIdsById: jest.Mock;
    getById: jest.Mock;
  };
  /** Funnel ON by default here, matching the shipped default. */
  let funnel: string | undefined;
  /** Paywall OFF by default here, also matching the shipped default. */
  let paywall: string | undefined;
  /**
   * Both default to "no pacote involved", which is the state of the
   * entire archive. The paywall tests that care override them.
   */
  let packageAccess: {
    isSubscriptionExcluded: jest.Mock;
    hasPurchased: jest.Mock;
    ownsPackage: jest.Mock;
  };

  beforeEach(async () => {
    prisma = makePrismaMock();
    activity = { record: jest.fn() };
    rbac = {
      getPermissionsForRole: jest.fn().mockResolvedValue([]),
      getPermissionsForPlan: jest.fn().mockResolvedValue([]),
    };
    funnel = undefined;
    paywall = undefined;
    packageAccess = {
      isSubscriptionExcluded: jest.fn().mockResolvedValue(false),
      hasPurchased: jest.fn().mockResolvedValue(false),
      ownsPackage: jest.fn().mockResolvedValue(false),
    };
    tree = {
      resolveSubtreeIds: jest.fn().mockResolvedValue([]),
      resolveSubtreeIdsById: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ArticlesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityLogService, useValue: activity },
        { provide: RbacService, useValue: rbac },
        { provide: CategoryTreeService, useValue: tree },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'FEATURE_PAYWALL' ? paywall : funnel,
          },
        },
        // Publishing an article publishes the images it uses. A double
        // rather than the real thing: these tests are about article
        // state, and the promotion has its own coverage.
        {
          provide: MediaService,
          useValue: { promoteForPublication: jest.fn().mockResolvedValue(0) },
        },
        { provide: PackageAccessService, useValue: packageAccess },
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

    // ── the pacote gate ──────────────────────────────────────────────
    //
    // Two failures to guard against, and they are not equally bad. The
    // dangerous one is a reader getting `content` they did not pay for.
    // The annoying one is a subscriber losing an article they should
    // have. Both are pinned below.

    const exclusive = {
      id: 'a1',
      slug: 'dossier',
      content: '<p>corpo</p>'.repeat(40),
      exclusive: true,
    };
    const subscriber = { id: 'r1', plan: 'PREMIUM' };
    const freeReader = { id: 'r2', plan: 'GRATIS' };

    /** The permission is what grants exclusives, never plan === PREMIUM. */
    const grantExclusives = () =>
      rbac.getPermissionsForPlan.mockResolvedValue([
        'assinantes.ler_exclusivos',
      ]);

    it('serves an exclusive in full while the paywall is off', async () => {
      prisma.article.findFirst.mockResolvedValueOnce(exclusive);
      const out = await service.findPublicBySlug('dossier', freeReader);
      expect(out).toHaveProperty('content');
      // Nothing about pacotes is even asked: the paywall being off is an
      // early return that must cost zero queries.
      expect(packageAccess.hasPurchased).not.toHaveBeenCalled();
      expect(packageAccess.isSubscriptionExcluded).not.toHaveBeenCalled();
    });

    it('costs an anonymous visitor no pacote queries at all', async () => {
      paywall = 'true';
      prisma.article.findFirst.mockResolvedValueOnce(exclusive);
      const out = await service.findPublicBySlug('dossier');
      expect(out).not.toHaveProperty('content');
      expect(out).toHaveProperty('paywalled', true);
      expect(packageAccess.hasPurchased).not.toHaveBeenCalled();
      expect(packageAccess.isSubscriptionExcluded).not.toHaveBeenCalled();
    });

    it('lets a subscriber read an exclusive that no pacote holds apart', async () => {
      paywall = 'true';
      grantExclusives();
      prisma.article.findFirst.mockResolvedValueOnce(exclusive);
      const out = await service.findPublicBySlug('dossier', subscriber);
      expect(out).toHaveProperty('content');
      // The purchase lookup is not reached — the plan already answered.
      expect(packageAccess.hasPurchased).not.toHaveBeenCalled();
    });

    it('THE INVERSION: a pacote sold apart beats the subscription', async () => {
      paywall = 'true';
      grantExclusives();
      packageAccess.isSubscriptionExcluded.mockResolvedValue(true);
      prisma.article.findFirst.mockResolvedValueOnce(exclusive);

      const out = await service.findPublicBySlug('dossier', subscriber);

      expect(out).not.toHaveProperty('content');
      expect(out).toHaveProperty('paywalled', true);
    });

    it('and the same subscriber reads it once they have bought the pacote', async () => {
      paywall = 'true';
      grantExclusives();
      packageAccess.isSubscriptionExcluded.mockResolvedValue(true);
      packageAccess.hasPurchased.mockResolvedValue(true);
      prisma.article.findFirst.mockResolvedValueOnce(exclusive);

      const out = await service.findPublicBySlug('dossier', subscriber);
      expect(out).toHaveProperty('content');
    });

    it('lets a free reader through on a purchase alone, with no plan', async () => {
      paywall = 'true';
      packageAccess.hasPurchased.mockResolvedValue(true);
      prisma.article.findFirst.mockResolvedValueOnce(exclusive);

      const out = await service.findPublicBySlug('dossier', freeReader);

      expect(out).toHaveProperty('content');
      expect(packageAccess.hasPurchased).toHaveBeenCalledWith('r2', 'a1');
    });

    it('cuts a free reader who bought nothing, and omits content entirely', async () => {
      paywall = 'true';
      prisma.article.findFirst.mockResolvedValueOnce(exclusive);

      const out = await service.findPublicBySlug('dossier', freeReader);

      // `in`, not a truthiness check: the key must be ABSENT, because the
      // frontend does `content ?? contentPreview` and an empty string
      // would win that and ship a blank article.
      expect('content' in out).toBe(false);
      expect(out).toHaveProperty('contentPreview');
    });

    it('withholds the video embed along with the body', async () => {
      paywall = 'true';
      prisma.article.findFirst.mockResolvedValueOnce({
        ...exclusive,
        videoEmbedUrl: 'https://www.youtube.com/embed/ABC123',
      });

      const out = await service.findPublicBySlug('dossier', freeReader);

      // The cut used to remove `content` and nothing else, so a paid
      // video report came back with a working player above the preview
      // text — the whole product delivered to an anonymous caller. Body
      // and video are one thing here, and they leave together.
      expect('videoEmbedUrl' in out).toBe(false);
      expect('content' in out).toBe(false);
    });

    it('never paywalls a free article, whatever pacote holds it', async () => {
      paywall = 'true';
      packageAccess.isSubscriptionExcluded.mockResolvedValue(true);
      prisma.article.findFirst.mockResolvedValueOnce({
        ...exclusive,
        exclusive: false,
      });

      const out = await service.findPublicBySlug('dossier', freeReader);

      // Membership only ever redirects who may read an ALREADY exclusive
      // article. If this ever fails, building a pacote around published
      // free articles silently takes them off the site.
      expect(out).toHaveProperty('content');
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

    it('funnels a category down to its whole subtree', async () => {
      tree.resolveSubtreeIds.mockResolvedValueOnce(['pt', 'ma', 'fu', 'se']);
      prisma.article.findMany.mockResolvedValueOnce([]);
      prisma.article.count.mockResolvedValueOnce(0);

      await service.listPublic({ category: 'portugal' } as never);

      const where = prisma.article.findMany.mock.calls[0][0].where;
      // categoryId IN, not a category relation filter — that switch is
      // what lets @@index([categoryId, status, publishedAt]) be used.
      expect(where).toMatchObject({ categoryId: { in: ['pt', 'ma', 'fu', 'se'] } });
      expect(where).not.toHaveProperty('category');
    });

    it('falls back to the exact category when the tree yields nothing', async () => {
      // An unknown slug, or a tree we failed to build. Returning the
      // category's own articles beats turning a cache problem into an
      // empty section page.
      tree.resolveSubtreeIds.mockResolvedValueOnce([]);
      prisma.article.findMany.mockResolvedValueOnce([]);
      prisma.article.count.mockResolvedValueOnce(0);

      await service.listPublic({ category: 'desconhecida' } as never);

      expect(prisma.article.findMany.mock.calls[0][0].where).toMatchObject({
        category: { slug: 'desconhecida' },
      });
    });

    it('reverts to exact-category filtering when CATEGORY_FUNNEL=0', async () => {
      funnel = '0';
      prisma.article.findMany.mockResolvedValueOnce([]);
      prisma.article.count.mockResolvedValueOnce(0);

      await service.listPublic({ category: 'portugal' } as never);

      expect(prisma.article.findMany.mock.calls[0][0].where).toMatchObject({
        category: { slug: 'portugal' },
      });
      expect(tree.resolveSubtreeIds).not.toHaveBeenCalled();
    });
  });

  describe('list() — the CMS list', () => {
    it('does NOT funnel by default', async () => {
      // An editor filtering by "Portugal" to find one piece means
      // literally Portugal. Mixing in four levels of children would make
      // the list unusable for the job it exists to do.
      prisma.article.findMany.mockResolvedValueOnce([]);
      prisma.article.count.mockResolvedValueOnce(0);

      await service.list({ category: 'portugal' } as never, {
        id: 'u1',
        role: 'SUPER_ADMIN',
      });

      expect(prisma.article.findMany.mock.calls[0][0].where).toMatchObject({
        category: { slug: 'portugal' },
      });
      expect(tree.resolveSubtreeIds).not.toHaveBeenCalled();
    });

    it('funnels only when includeDescendants is explicitly asked for', async () => {
      tree.resolveSubtreeIds.mockResolvedValueOnce(['pt', 'ma']);
      prisma.article.findMany.mockResolvedValueOnce([]);
      prisma.article.count.mockResolvedValueOnce(0);

      await service.list(
        { category: 'portugal', includeDescendants: true } as never,
        { id: 'u1', role: 'SUPER_ADMIN' },
      );

      expect(prisma.article.findMany.mock.calls[0][0].where).toMatchObject({
        categoryId: { in: ['pt', 'ma'] },
      });
    });

    it('ignores includeDescendants while the kill switch is off', async () => {
      funnel = 'false';
      prisma.article.findMany.mockResolvedValueOnce([]);
      prisma.article.count.mockResolvedValueOnce(0);

      await service.list(
        { category: 'portugal', includeDescendants: true } as never,
        { id: 'u1', role: 'SUPER_ADMIN' },
      );

      expect(prisma.article.findMany.mock.calls[0][0].where).toMatchObject({
        category: { slug: 'portugal' },
      });
    });

    it('scopes to own articles without editar_todos or ler_todos', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce(['artigos.editar_proprios']);
      prisma.article.findMany.mockResolvedValueOnce([]);
      prisma.article.count.mockResolvedValueOnce(0);

      await service.list({} as never, { id: 'u1', role: 'JORNALISTA' });

      expect(prisma.article.findMany.mock.calls[0][0].where).toMatchObject({
        authorId: 'u1',
      });
    });

    it('does not scope to own articles with artigos.editar_todos', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce(['artigos.editar_todos']);
      prisma.article.findMany.mockResolvedValueOnce([]);
      prisma.article.count.mockResolvedValueOnce(0);

      await service.list({} as never, { id: 'u1', role: 'EDITOR' });

      expect(prisma.article.findMany.mock.calls[0][0].where).not.toHaveProperty(
        'authorId',
      );
    });

    it('does not scope to own articles with artigos.ler_todos', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce(['artigos.ler_todos']);
      prisma.article.findMany.mockResolvedValueOnce([]);
      prisma.article.count.mockResolvedValueOnce(0);

      await service.list({} as never, { id: 'u1', role: 'REVISOR' });

      expect(prisma.article.findMany.mock.calls[0][0].where).not.toHaveProperty(
        'authorId',
      );
    });

    it('never scopes SUPER_ADMIN, regardless of rbac', async () => {
      prisma.article.findMany.mockResolvedValueOnce([]);
      prisma.article.count.mockResolvedValueOnce(0);

      await service.list({} as never, { id: 'u1', role: 'SUPER_ADMIN' });

      expect(rbac.getPermissionsForRole).not.toHaveBeenCalled();
      expect(prisma.article.findMany.mock.calls[0][0].where).not.toHaveProperty(
        'authorId',
      );
    });
  });

  describe('getStats()', () => {
    it('scopes to own articles without editar_todos or ler_todos', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce([]);
      prisma.article.groupBy.mockResolvedValueOnce([]);
      prisma.article.aggregate.mockResolvedValueOnce({ _sum: { views: null } });

      await service.getStats({ id: 'u1', role: 'JORNALISTA' });

      expect(prisma.article.groupBy.mock.calls[0][0].where).toEqual({
        authorId: 'u1',
      });
      expect(prisma.article.aggregate.mock.calls[0][0].where).toEqual({
        authorId: 'u1',
      });
    });

    it('does not scope with artigos.ler_todos', async () => {
      rbac.getPermissionsForRole.mockResolvedValueOnce(['artigos.ler_todos']);
      prisma.article.groupBy.mockResolvedValueOnce([]);
      prisma.article.aggregate.mockResolvedValueOnce({ _sum: { views: null } });

      await service.getStats({ id: 'u1', role: 'ANALISTA' });

      expect(prisma.article.groupBy.mock.calls[0][0].where).toEqual({});
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

    it('does not widen when the exact category already fills the quota', async () => {
      // A well-stocked category must never show a neighbour's article.
      prisma.article.findUnique.mockResolvedValueOnce({ id: 'a1', categoryId: 'se' });
      prisma.article.findMany.mockResolvedValueOnce([
        { id: 'a2' },
        { id: 'a3' },
      ]);

      const out = await service.findRelated('s', 2);

      expect(out).toHaveLength(2);
      expect(prisma.article.findMany).toHaveBeenCalledTimes(1);
      expect(tree.getById).not.toHaveBeenCalled();
    });

    it('tops up from the PARENT subtree when the category is thin', async () => {
      prisma.article.findUnique.mockResolvedValueOnce({ id: 'a1', categoryId: 'se' });
      prisma.article.findMany
        .mockResolvedValueOnce([{ id: 'a2' }]) // only one sibling
        .mockResolvedValueOnce([{ id: 'a9' }]); // cousin from the Funchal
      tree.getById.mockResolvedValueOnce({ id: 'se', parentId: 'fu' });
      tree.resolveSubtreeIdsById.mockResolvedValueOnce(['fu', 'se']);

      const out = await service.findRelated('s', 2);

      expect(out.map((a: { id: string }) => a.id)).toEqual(['a2', 'a9']);
      const second = prisma.article.findMany.mock.calls[1][0];
      expect(second.where).toMatchObject({ categoryId: { in: ['fu', 'se'] } });
      // Never re-suggests what it already returned, nor the article itself.
      expect(second.where.NOT).toEqual({ id: { in: ['a1', 'a2'] } });
      expect(second.take).toBe(1);
    });

    it('stays put when the thin category is already a root', async () => {
      // No parent to widen into — the whole site is not "related".
      prisma.article.findUnique.mockResolvedValueOnce({ id: 'a1', categoryId: 'pt' });
      prisma.article.findMany.mockResolvedValueOnce([]);
      tree.getById.mockResolvedValueOnce({ id: 'pt', parentId: null });

      await expect(service.findRelated('s', 4)).resolves.toEqual([]);
      expect(prisma.article.findMany).toHaveBeenCalledTimes(1);
    });

    it('does not widen at all while CATEGORY_FUNNEL=0', async () => {
      funnel = '0';
      prisma.article.findUnique.mockResolvedValueOnce({ id: 'a1', categoryId: 'se' });
      prisma.article.findMany.mockResolvedValueOnce([]);

      await service.findRelated('s', 4);

      expect(prisma.article.findMany).toHaveBeenCalledTimes(1);
      expect(tree.getById).not.toHaveBeenCalled();
    });
  });
});
