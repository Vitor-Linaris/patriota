import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const TREE_CACHE_KEY = 'categories:tree:v1';
const TREE_CACHE_TTL_SECONDS = 300;

export interface CategoryTreeNode {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  visible: boolean;
  /** Whether readers are offered this section to follow by e-mail. */
  followable: boolean;
  parentId: string | null;
  depth: number;
  /** Self-inclusive materialised path, e.g. "/portugalId/madeiraId/". */
  path: string;
  order: number;
  /** Direct PUBLICADO article count on this node only. */
  articleCount: number;
  /** Rolled up through the whole subtree, this node included. */
  articleCountTotal: number;
  children: CategoryTreeNode[];
}

/**
 * Every id under `node`, itself included — a prefix match on the
 * materialised path, which is the whole reason that column exists.
 */
function descendantsOf(
  tree: CategoryTreeNode[],
  node: CategoryTreeNode | undefined,
): string[] {
  if (!node) return [];
  return tree.filter((n) => n.path.startsWith(node.path)).map((n) => n.id);
}

/**
 * The whole category tree, read from Postgres at most once every 5
 * minutes and served from Redis the rest of the time.
 *
 * Why cache the tree instead of querying it per request: the tree is a
 * few hundred nodes at most and changes rarely (an editor dragging
 * something in the admin), while every category page render and — once
 * the funnel ships — every public article listing needs to resolve a
 * subtree. Reading it from Postgres on every request would put a query
 * on the hottest path in the app for data that is essentially static.
 *
 * Why NOT a recursive query: Prisma 7 has no native recursive CTE, which
 * would mean hand-written $queryRaw on every read. The materialised
 * `path` column makes a subtree a plain in-memory `startsWith()` instead
 * — zero SQL, zero recursion, and it works identically whether the cache
 * is warm or being rebuilt.
 */
@Injectable()
export class CategoryTreeService {
  private readonly logger = new Logger(CategoryTreeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * The full tree, flat (every node exactly once) with `children`
   * populated for traversal.
   *
   * The linkage is rebuilt on the way out rather than stored, because
   * `children` holds references: serialising it would write every subtree
   * twice (once nested, once at top level), and JSON.parse would hand
   * back COPIES, so `tree.find(byId)` and `parent.children[0]` would stop
   * being the same object on a cache hit but not on a miss. Relinking
   * after both paths keeps the two indistinguishable.
   */
  async getTree(): Promise<CategoryTreeNode[]> {
    const cached = await this.readCache();
    if (cached) return this.link(cached);

    const built = await this.buildTree();
    await this.writeCache(built); // unlinked: children is [] on every node
    return this.link(built);
  }

  /** Just the roots, nested — the shape the admin tree UI consumes. */
  async getForest(): Promise<CategoryTreeNode[]> {
    const tree = await this.getTree();
    return tree.filter((n) => n.parentId === null);
  }

  /**
   * Call after ANY category mutation — create, update, delete, move,
   * visibility toggle. Never throws: a Redis outage must not turn a
   * category edit into a 500. Worst case on a failed invalidation is a
   * stale tree for up to TREE_CACHE_TTL_SECONDS, which is the same
   * staleness window a cache miss already tolerates.
   */
  async invalidate(): Promise<void> {
    try {
      await this.redis.getClient().del(TREE_CACHE_KEY);
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate category tree cache: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Every id in the subtree rooted at `slug`, self included. Empty array
   * for an unknown slug — callers treat that as "no results" rather than
   * a 404, matching how `where.categoryId: { in: [] }` behaves in Prisma.
   */
  async resolveSubtreeIds(slug: string): Promise<string[]> {
    const tree = await this.getTree();
    return descendantsOf(tree, tree.find((n) => n.slug === slug));
  }

  /** Same, addressed by id — used when walking up from a known node. */
  async resolveSubtreeIdsById(id: string): Promise<string[]> {
    const tree = await this.getTree();
    return descendantsOf(tree, tree.find((n) => n.id === id));
  }

  /**
   * The node and every ancestor above it, LEAF FIRST.
   *
   * Read straight off the materialised path rather than walked, so it
   * costs one lookup whatever the depth. An unknown id yields just
   * itself: a caller that cannot resolve the tree should still act on
   * the category it was given rather than on nothing.
   */
  async resolveAncestorIds(id: string): Promise<string[]> {
    const node = await this.getById(id);
    if (!node) return [id];
    const rootFirst = node.path.split('/').filter(Boolean);
    return rootFirst.length > 0 ? rootFirst.reverse() : [id];
  }

  async getBySlug(slug: string): Promise<CategoryTreeNode | null> {
    const tree = await this.getTree();
    return tree.find((n) => n.slug === slug) ?? null;
  }

  async getById(id: string): Promise<CategoryTreeNode | null> {
    const tree = await this.getTree();
    return tree.find((n) => n.id === id) ?? null;
  }

  // ─────────────────────────────── internals ───────────────────────────────

  private async readCache(): Promise<CategoryTreeNode[] | null> {
    try {
      const raw = await this.redis.getClient().get(TREE_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as CategoryTreeNode[];
    } catch (err) {
      // A corrupt entry or a Redis blip falls back to rebuilding from
      // Postgres rather than ever breaking a category page.
      this.logger.warn(
        `Category tree cache read failed, rebuilding from Postgres: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private async writeCache(tree: CategoryTreeNode[]): Promise<void> {
    try {
      await this.redis
        .getClient()
        .set(TREE_CACHE_KEY, JSON.stringify(tree), 'EX', TREE_CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(
        `Category tree cache write failed (will retry from Postgres next read): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async buildTree(): Promise<CategoryTreeNode[]> {
    const [rows, counts] = await Promise.all([
      // depth ASC guarantees a parent row is already in `byId` by the
      // time any of its children link against it, below.
      this.prisma.category.findMany({
        orderBy: [{ depth: 'asc' }, { order: 'asc' }],
      }),
      // _count.articles on the Prisma relation can't roll up a subtree —
      // groupBy plus the post-order fold below is the whole point of
      // this service. Two queries for the entire catalogue, replacing
      // what was 1 query + N per-category subqueries before this.
      this.prisma.article.groupBy({
        by: ['categoryId'],
        where: { status: 'PUBLICADO' },
        _count: { _all: true },
      }),
    ]);

    const countByCategory = new Map(
      counts.map((c) => [c.categoryId, c._count._all]),
    );

    const byId = new Map<string, CategoryTreeNode>();
    for (const row of rows) {
      const direct = countByCategory.get(row.id) ?? 0;
      byId.set(row.id, {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        icon: row.icon,
        color: row.color,
        visible: row.visible,
        followable: row.followable,
        parentId: row.parentId,
        depth: row.depth,
        path: row.path,
        order: row.order,
        articleCount: direct,
        articleCountTotal: direct,
        children: [],
      });
    }

    // Roll up leaf -> root in a single reverse pass. `rows` is sorted
    // depth ASC, so iterating backwards visits every depth-3 row before
    // any depth-2 row, every depth-2 before any depth-1, and so on. By
    // the time a node is read here as `node`, it has already received
    // every contribution from its own children (added in earlier
    // iterations of this same loop, when THEY looked up THEIR parent).
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i]!;
      if (!row.parentId) continue;
      const node = byId.get(row.id)!;
      const parent = byId.get(row.parentId);
      if (parent) parent.articleCountTotal += node.articleCountTotal;
    }

    return [...byId.values()];
  }

  /**
   * Populates `children` in place from `parentId`, ordered by `order`.
   * Idempotent — clears first, so calling it on an already-linked tree
   * doesn't append a second copy of every child.
   */
  private link(nodes: CategoryTreeNode[]): CategoryTreeNode[] {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const node of nodes) node.children = [];
    for (const node of nodes) {
      if (node.parentId) byId.get(node.parentId)?.children.push(node);
    }
    for (const node of nodes) {
      node.children.sort((a, b) => a.order - b.order);
    }
    return nodes;
  }
}
