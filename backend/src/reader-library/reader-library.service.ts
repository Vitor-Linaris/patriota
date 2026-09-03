import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryTreeService } from '../categories/category-tree.service';
import {
  toSkipTake,
  type PageQueryDto,
  type PageResult,
} from '../common/dto/pagination.dto';

function isPrismaCode(e: unknown, code: string): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: unknown }).code === code
  );
}

/** Card shape for saved articles and history — enough to render a list item. */
const ARTICLE_CARD = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  coverImageUrl: true,
  readMinutes: true,
  publishedAt: true,
  exclusive: true,
  commentCount: true,
  category: { select: { slug: true, name: true, color: true } },
} as const;

@Injectable()
export class ReaderLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: CategoryTreeService,
  ) {}

  // ───────────────────────── favourite categories ─────────────────────────

  async listCategoryFavorites(readerId: string) {
    const rows = await this.prisma.categoryFavorite.findMany({
      where: { readerId },
      orderBy: { createdAt: 'desc' },
      select: {
        notify: true,
        createdAt: true,
        category: {
          select: { id: true, slug: true, name: true, color: true, icon: true },
        },
      },
    });
    return rows.map((r) => ({ ...r.category, notify: r.notify, since: r.createdAt }));
  }

  /**
   * Every category a reader may follow, with what they have chosen.
   *
   * Replaces a page that listed only what somebody already followed and,
   * to anybody who followed nothing, said "use the Seguir button on an
   * article" — sending them away to find the feature by accident. This
   * is the same information turned round: here is the paper, pick.
   *
   * Followable AND visible: `followable` says the newsroom is willing to
   * promise mail about this section; `visible` says the section exists
   * on the site at all. Offering to subscribe to something hidden from
   * the menu would be inviting people to a page they cannot reach.
   *
   * Top-level sections only (`depth: 0`). Following now always means
   * "this section and everything under it" — subsections are not a
   * separate choice any more, they inherit whatever their root is
   * subscribed to (see notifyTargets() in
   * reader-notifications.service.ts, which already walked the article's
   * category up to its ancestors for exactly this reason). Listing
   * subsections here too would offer a choice that does not exist:
   * following "Portugal › Madeira" was never narrower than following
   * "Portugal", it was the same subscription with more steps.
   *
   * A category the reader already follows is included even when it has
   * since been withdrawn, and marked — otherwise their own follow would
   * vanish off the page with no way to turn it off, and the e-mails
   * would keep arriving.
   */
  async listFollowableCategories(readerId: string) {
    const [cats, follows] = await Promise.all([
      this.prisma.category.findMany({
        where: { followable: true, visible: true, depth: 0 },
        // All at depth 0, so `path` alone (one segment each) is enough
        // to sort them consistently.
        orderBy: [{ path: 'asc' }],
        select: {
          id: true,
          slug: true,
          name: true,
          color: true,
          icon: true,
        },
      }),
      this.prisma.categoryFavorite.findMany({
        where: { readerId },
        select: {
          categoryId: true,
          notify: true,
          createdAt: true,
          category: {
            select: {
              id: true,
              slug: true,
              name: true,
              color: true,
              icon: true,
              followable: true,
              visible: true,
            },
          },
        },
      }),
    ]);

    const chosen = new Map(follows.map((f) => [f.categoryId, f]));
    const listed = new Set(cats.map((c) => c.id));

    const rows = cats.map((c) => {
      const f = chosen.get(c.id);
      return {
        ...c,
        following: f !== undefined,
        notify: f?.notify ?? false,
        since: f?.createdAt ?? null,
        /** Still on offer. False only on the withdrawn ones below. */
        available: true,
      };
    });

    // The withdrawn ones they still follow, appended rather than mixed
    // in: they are not part of the catalogue any more, and sorting them
    // among it would suggest anybody else could pick them too.
    for (const f of follows) {
      if (listed.has(f.categoryId)) continue;
      const { followable: _f, visible: _v, ...cat } = f.category;
      void _f;
      void _v;
      rows.push({
        ...cat,
        following: true,
        notify: f.notify,
        since: f.createdAt,
        available: false,
      });
    }

    return rows;
  }

  /**
   * Idempotent by design — PUT, not POST. A double tap on the follow
   * button must be a no-op, not a P2002 rendered as a 500.
   *
   * `notify` is separate from the favourite itself: a reader can follow a
   * category for their dashboard while muting its e-mails.
   *
   * Resolved to its ROOT ancestor before anything else. Following is a
   * root-level subscription now — a subsection is not a narrower one, it
   * is covered by whichever root it sits under (notifyTargets() in
   * reader-notifications.service.ts already walks an article's category
   * up to the root when deciding who to mail). Normalising here, not
   * only in the UI that calls this, means a stale client or a hand-built
   * request with a subsection id still lands on the same row everyone
   * else following that section has, instead of quietly creating a
   * second, narrower subscription nothing else knows how to show.
   */
  async followCategory(readerId: string, categoryId: string, notify = true) {
    categoryId = await this.resolveRootId(categoryId);

    const cat = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, followable: true, visible: true },
    });
    if (!cat) throw new NotFoundException('Categoria não encontrada.');

    // A category not on offer cannot be followed by id either. The list
    // is what a reader sees, but the id is guessable and this endpoint
    // is the thing that actually signs somebody up for e-mail.
    //
    // Checked only for NEW follows: somebody who already follows a
    // category that has since been withdrawn keeps the row, and this is
    // the call their "mute e-mails" switch makes. Refusing it would
    // leave them receiving mail with no way to stop it.
    const already = await this.prisma.categoryFavorite.findUnique({
      where: { readerId_categoryId: { readerId, categoryId } },
      select: { readerId: true },
    });
    if (!already && (!cat.followable || !cat.visible)) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    await this.prisma.categoryFavorite.upsert({
      where: { readerId_categoryId: { readerId, categoryId } },
      update: { notify },
      create: { readerId, categoryId, notify },
    });
    return { following: true, notify };
  }

  /**
   * Also idempotent: unfollowing something you do not follow is fine.
   * Resolved to root first, same reasoning as followCategory() above —
   * unfollowing a subsection id must clear the root row, since that is
   * the row that actually exists.
   */
  async unfollowCategory(readerId: string, categoryId: string) {
    categoryId = await this.resolveRootId(categoryId);
    await this.prisma.categoryFavorite.deleteMany({
      where: { readerId, categoryId },
    });
    return { following: false };
  }

  // ────────────────────────── favourite articles ──────────────────────────

  async listArticleFavorites(
    readerId: string,
    query: PageQueryDto,
  ): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);
    const [rows, total] = await Promise.all([
      this.prisma.articleFavorite.findMany({
        where: { readerId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, article: { select: ARTICLE_CARD } },
      }),
      this.prisma.articleFavorite.count({ where: { readerId } }),
    ]);

    return {
      items: rows.map((r) => ({ ...r.article, savedAt: r.createdAt })),
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  async saveArticle(readerId: string, articleId: string) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, status: true },
    });
    // Only published articles can be saved — otherwise a guessed id would
    // confirm that a draft exists.
    if (!article || article.status !== 'PUBLICADO') {
      throw new NotFoundException('Notícia não encontrada.');
    }

    await this.prisma.articleFavorite.upsert({
      where: { readerId_articleId: { readerId, articleId } },
      update: {},
      create: { readerId, articleId },
    });
    return { saved: true };
  }

  async unsaveArticle(readerId: string, articleId: string) {
    await this.prisma.articleFavorite.deleteMany({ where: { readerId, articleId } });
    return { saved: false };
  }

  // ──────────────────────────────  history  ──────────────────────────────

  async listHistory(
    readerId: string,
    query: PageQueryDto,
  ): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);
    const [rows, total] = await Promise.all([
      this.prisma.readingHistory.findMany({
        where: { readerId },
        skip,
        take,
        orderBy: { lastReadAt: 'desc' },
        select: {
          lastReadAt: true,
          readCount: true,
          progress: true,
          article: { select: ARTICLE_CARD },
        },
      }),
      this.prisma.readingHistory.count({ where: { readerId } }),
    ]);

    return {
      items: rows.map((r) => ({
        ...r.article,
        lastReadAt: r.lastReadAt,
        readCount: r.readCount,
        progress: r.progress,
      })),
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  /**
   * One upserted row per (reader, article) rather than an append-only
   * event log: the table stays bounded and the history page is a single
   * indexed scan. readCount recovers the "read it twice" signal.
   *
   * `progress` only ever moves forward — a reader scrolling back up should
   * not lower their furthest point.
   */
  async trackRead(readerId: string, articleId: string, progress?: number) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, status: true },
    });
    if (!article || article.status !== 'PUBLICADO') {
      throw new NotFoundException('Notícia não encontrada.');
    }

    const clamped =
      progress === undefined ? undefined : Math.min(100, Math.max(0, progress));

    const existing = await this.prisma.readingHistory.findUnique({
      where: { readerId_articleId: { readerId, articleId } },
      select: { progress: true },
    });

    await this.prisma.readingHistory.upsert({
      where: { readerId_articleId: { readerId, articleId } },
      update: {
        lastReadAt: new Date(),
        readCount: { increment: 1 },
        ...(clamped !== undefined && clamped > (existing?.progress ?? 0)
          ? { progress: clamped }
          : {}),
      },
      create: {
        readerId,
        articleId,
        progress: clamped ?? 0,
      },
    });
    return { tracked: true };
  }

  async clearHistory(readerId: string) {
    const { count } = await this.prisma.readingHistory.deleteMany({
      where: { readerId },
    });
    return { removed: count };
  }

  // ─────────────────────────────── per-article ───────────────────────────────

  /**
   * Everything the article page needs to render its reader-specific
   * controls in one round trip: the heart, the "seguir categoria" toggle
   * and whether they have already commented.
   *
   * Fetched client-side precisely so the SSR output stays identical for
   * every visitor — categoria/[slug] is prerendered, and per-user state
   * must never be baked into a prerendered page.
   *
   * The star follows the ROOT of the article's category, not the
   * article's own (possibly deep) category. An article filed under
   * "Portugal › Madeira › Funchal" already reaches a reader following
   * "Portugal" — notifyTargets() in reader-notifications.service.ts
   * walks the same chain the other way when deciding who to mail — so
   * the button has to name and act on "Portugal", the thing a reader
   * can actually subscribe to, not "Funchal", which was never on offer.
   */
  async articleState(readerId: string, articleId: string) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, categoryId: true },
    });
    if (!article) throw new NotFoundException('Notícia não encontrada.');

    const root = await this.tree.getById(article.categoryId);
    const rootId = root
      ? (root.path.split('/').filter(Boolean)[0] ?? root.id)
      : article.categoryId;
    // Falls back to the article's own category+name when the tree
    // cannot resolve it (a stale cache entry, a category deleted out
    // from under an already-rendered page) — the button still works,
    // it just names the article's direct section instead of its root.
    const rootNode =
      rootId === article.categoryId ? root : await this.tree.getById(rootId);

    const [favorite, categoryFavorite, comments, history] = await Promise.all([
      this.prisma.articleFavorite.findUnique({
        where: { readerId_articleId: { readerId, articleId } },
        select: { readerId: true },
      }),
      this.prisma.categoryFavorite.findUnique({
        where: {
          readerId_categoryId: { readerId, categoryId: rootId },
        },
        select: { notify: true },
      }),
      this.prisma.comment.count({
        where: { readerId, articleId, status: { not: 'ELIMINADO' } },
      }),
      this.prisma.readingHistory.findUnique({
        where: { readerId_articleId: { readerId, articleId } },
        select: { progress: true },
      }),
    ]);

    return {
      articleId,
      categoryId: rootId,
      categoryName: rootNode?.name ?? null,
      categorySlug: rootNode?.slug ?? null,
      saved: favorite !== null,
      followingCategory: categoryFavorite !== null,
      categoryNotify: categoryFavorite?.notify ?? false,
      commentCount: comments,
      inHistory: history !== null,
      progress: history?.progress ?? 0,
    };
  }

  /** The root ancestor id of any category id — itself, if already a root. */
  private async resolveRootId(categoryId: string): Promise<string> {
    const node = await this.tree.getById(categoryId);
    if (!node) return categoryId;
    return node.path.split('/').filter(Boolean)[0] ?? categoryId;
  }
}

export { isPrismaCode };
