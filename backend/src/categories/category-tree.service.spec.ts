import { Test } from '@nestjs/testing';
import { CategoryTreeService } from './category-tree.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

function makePrismaMock() {
  return {
    category: { findMany: jest.fn() },
    article: { groupBy: jest.fn().mockResolvedValue([]) },
  };
}

function makeRedisMock() {
  const client = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  return { getClient: jest.fn().mockReturnValue(client), client };
}

/**
 * A four-level chain — Portugal -> Madeira -> Funchal -> Sé — mirrors the
 * client's own example, so the depth math in the rollup and the
 * subtree-by-path resolution both get exercised at the depth that
 * actually matters for this feature.
 */
function fourLevelRows() {
  return [
    { id: 'pt', slug: 'portugal', name: 'Portugal', icon: '◆', color: '#000', visible: true, parentId: null, depth: 0, path: '/pt/', order: 0 },
    { id: 'ma', slug: 'madeira', name: 'Madeira', icon: '◆', color: '#000', visible: true, parentId: 'pt', depth: 1, path: '/pt/ma/', order: 0 },
    { id: 'fu', slug: 'funchal', name: 'Funchal', icon: '◆', color: '#000', visible: true, parentId: 'ma', depth: 2, path: '/pt/ma/fu/', order: 0 },
    { id: 'se', slug: 'se', name: 'Sé', icon: '◆', color: '#000', visible: true, parentId: 'fu', depth: 3, path: '/pt/ma/fu/se/', order: 0 },
    // An unrelated root + child so subtree resolution can prove it does
    // NOT leak siblings outside the requested branch.
    { id: 'dp', slug: 'desporto', name: 'Desporto', icon: '◆', color: '#000', visible: true, parentId: null, depth: 0, path: '/dp/', order: 1 },
  ];
}

describe('CategoryTreeService', () => {
  let service: CategoryTreeService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let redis: ReturnType<typeof makeRedisMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    redis = makeRedisMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoryTreeService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    service = moduleRef.get(CategoryTreeService);
  });

  describe('getTree()', () => {
    it('serves from Redis on a cache hit without touching Postgres', async () => {
      const cached = [{ id: 'x' }];
      redis.client.get.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.getTree();

      expect(result).toEqual(cached);
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('rebuilds from Postgres and writes the cache on a miss', async () => {
      redis.client.get.mockResolvedValueOnce(null);
      prisma.category.findMany.mockResolvedValueOnce(fourLevelRows());

      const result = await service.getTree();

      expect(result).toHaveLength(5);
      expect(redis.client.set).toHaveBeenCalledWith(
        'categories:tree:v1',
        expect.any(String),
        'EX',
        300,
      );
    });

    it('falls back to Postgres when the cached entry is corrupt', async () => {
      redis.client.get.mockResolvedValueOnce('{not-json');
      prisma.category.findMany.mockResolvedValueOnce(fourLevelRows());

      const result = await service.getTree();

      expect(result).toHaveLength(5);
    });

    it('falls back to Postgres when Redis itself is unreachable', async () => {
      redis.client.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      redis.client.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      prisma.category.findMany.mockResolvedValueOnce(fourLevelRows());

      await expect(service.getTree()).resolves.toHaveLength(5);
    });

    it('nests children under their parent', async () => {
      redis.client.get.mockResolvedValueOnce(null);
      prisma.category.findMany.mockResolvedValueOnce(fourLevelRows());

      const tree = await service.getTree();
      const pt = tree.find((n) => n.id === 'pt')!;
      const ma = tree.find((n) => n.id === 'ma')!;

      expect(pt.children.map((c) => c.id)).toEqual(['ma']);
      expect(ma.children.map((c) => c.id)).toEqual(['fu']);
    });

    it('rolls up article counts through all four levels', async () => {
      redis.client.get.mockResolvedValueOnce(null);
      prisma.category.findMany.mockResolvedValueOnce(fourLevelRows());
      prisma.article.groupBy.mockResolvedValueOnce([
        { categoryId: 'se', _count: { _all: 3 } },
        { categoryId: 'ma', _count: { _all: 2 } },
      ]);

      const tree = await service.getTree();
      const byId = Object.fromEntries(tree.map((n) => [n.id, n]));

      expect(byId.se.articleCount).toBe(3);
      expect(byId.se.articleCountTotal).toBe(3);
      expect(byId.fu.articleCount).toBe(0);
      expect(byId.fu.articleCountTotal).toBe(3); // rolled up from Sé
      expect(byId.ma.articleCount).toBe(2);
      expect(byId.ma.articleCountTotal).toBe(5); // own 2 + Funchal's 3
      expect(byId.pt.articleCountTotal).toBe(5);
      expect(byId.dp.articleCountTotal).toBe(0); // unrelated branch untouched
    });
  });

  describe('resolveSubtreeIds()', () => {
    it('returns the node itself plus every descendant, self-inclusive', async () => {
      redis.client.get.mockResolvedValueOnce(null);
      prisma.category.findMany.mockResolvedValueOnce(fourLevelRows());

      const ids = await service.resolveSubtreeIds('madeira');

      expect(new Set(ids)).toEqual(new Set(['ma', 'fu', 'se']));
    });

    it('does not leak ids from an unrelated branch', async () => {
      redis.client.get.mockResolvedValueOnce(null);
      prisma.category.findMany.mockResolvedValueOnce(fourLevelRows());

      const ids = await service.resolveSubtreeIds('funchal');

      expect(ids).not.toContain('dp');
      expect(ids).not.toContain('pt');
      expect(ids).not.toContain('ma');
    });

    it('returns an empty array for an unknown slug rather than throwing', async () => {
      redis.client.get.mockResolvedValueOnce(null);
      prisma.category.findMany.mockResolvedValueOnce(fourLevelRows());

      await expect(service.resolveSubtreeIds('nao-existe')).resolves.toEqual(
        [],
      );
    });

    it('resolves a single leaf to just itself', async () => {
      redis.client.get.mockResolvedValueOnce(null);
      prisma.category.findMany.mockResolvedValueOnce(fourLevelRows());

      const ids = await service.resolveSubtreeIds('se');

      expect(ids).toEqual(['se']);
    });
  });

  describe('invalidate()', () => {
    it('deletes the cache key', async () => {
      await service.invalidate();
      expect(redis.client.del).toHaveBeenCalledWith('categories:tree:v1');
    });

    it('never throws when Redis is unreachable', async () => {
      redis.client.del.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(service.invalidate()).resolves.toBeUndefined();
    });
  });
});
