import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { RbacService } from '../rbac/rbac.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ListArticlesQueryDto } from './dto/list-articles.query.dto';
import { ArticleStatus, type ReaderPlan } from '../../generated/prisma/enums';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { CategoryTreeService } from '../categories/category-tree.service';
import {
  PageResult,
  toSkipTake,
} from '../common/dto/pagination.dto';
import type { Role } from '../rbac/rbac.constants';
import { previewOf } from './paywall';
import { MediaService } from '../media/media.service';

interface ActingUser {
  id: string;
  role: Role;
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function isPrismaCode(e: unknown, code: string): boolean {
  return Boolean(
    e && typeof e === 'object' && (e as { code?: string }).code === code,
  );
}

/**
 * Everything a public reader is allowed to see of an article — and, by
 * omission, everything they are not.
 *
 * An explicit `select`, NOT an `include`. This is the difference that
 * matters: Prisma's `include` returns every scalar column on the model,
 * so each new column added to Article was silently published the day it
 * was created. That is how `draft` — the unpublished text of an article
 * being rewritten — ended up being served to anyone who called the API,
 * and how `rejectionReason` — an editor's private note explaining why
 * they refused a piece — has been public all along.
 *
 * Deliberately absent, and they must stay absent: draft, draftUpdatedAt,
 * draftAwaitingReview, rejectionReason, notificationsQueuedAt, authorId,
 * createdAt, updatedAt, scheduledAt.
 *
 * Adding a column to Article does not add it here. That is the point.
 */
const PUBLIC_ARTICLE_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  status: true,
  exclusive: true,
  views: true,
  readMinutes: true,
  tags: true,
  essentials: true,
  context: true,
  pullQuote: true,
  metaTitle: true,
  metaDescription: true,
  coverImageUrl: true,
  publishedAt: true,
  commentCount: true,
  categoryId: true,
  category: { select: { slug: true, name: true, color: true } },
  author: { select: { name: true } },
} as const;

/**
 * The article page, and the ONLY public shape that carries `content`.
 *
 * That exclusivity is load-bearing. The card select above used to include
 * the body too, which meant the homepage shipped twelve complete articles
 * to render twelve headlines — and, once exclusives had to be withheld,
 * meant a paywall on the article page that anyone could walk around by
 * calling /public/articles instead. Keeping the body to the one endpoint
 * that displays it makes the paywall a single decision rather than four,
 * and drops the homepage payload to a fraction of what it was.
 *
 * The byline's author id lives here too, for the link.
 */
const PUBLIC_ARTICLE_DETAIL_SELECT = {
  ...PUBLIC_ARTICLE_SELECT,
  content: true,
  author: { select: { id: true, name: true } },
} as const;

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly rbac: RbacService,
    private readonly tree: CategoryTreeService,
    private readonly config: ConfigService,
    private readonly media: MediaService,
  ) {}

  // ── helpers ────────────────────────────────────────────────────────

  /**
   * Kill switch for the whole subtree funnel. ON unless explicitly
   * disabled, so production can revert to per-category filtering with an
   * env var instead of a deploy.
   */
  private get funnelEnabled(): boolean {
    const raw = this.config.get<string>('CATEGORY_FUNNEL');
    return raw !== '0' && raw !== 'false';
  }

  /**
   * The paywall, off unless explicitly turned on.
   *
   * Opposite default to CATEGORY_FUNNEL above, and deliberately so: a
   * funnel that fails open shows a reader more articles, while a paywall
   * that fails open gives away the product. Withholding text people have
   * already been reading for free is a decision somebody has to make on
   * purpose, on the day they mean to make it.
   */
  private get paywallEnabled(): boolean {
    return this.config.get<string>('FEATURE_PAYWALL') === 'true';
  }

  /**
   * The where-fragment for ?category=<slug>.
   *
   * Widened, this stops being a relation filter (which Prisma compiles to
   * a join against Category, unable to use the leading column of
   * @@index([categoryId, status, publishedAt])) and becomes a plain
   * categoryId IN — so the funnel is a performance GAIN, not a cost.
   */
  private async categoryWhere(
    slug: string,
    widen: boolean,
  ): Promise<Record<string, unknown>> {
    if (!widen) return { category: { slug } };

    const ids = await this.tree.resolveSubtreeIds(slug);
    // Empty means either an unknown slug or a tree we failed to build.
    // Falling back to the relation filter keeps a valid slug returning
    // its own articles instead of turning a cache problem into an empty
    // section page.
    if (ids.length === 0) return { category: { slug } };
    return { categoryId: { in: ids } };
  }
  private async ensureCategory(categoryId: string) {
    const cat = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!cat) throw new NotFoundException('Categoria não encontrada.');
  }

  private async loadOrThrow(id: string) {
    const a = await this.prisma.article.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Artigo não encontrado.');
    return a;
  }

  private async assertCanEdit(
    article: { authorId: string },
    user: ActingUser,
  ) {
    if (user.role === 'SUPER_ADMIN') return;
    const perms = await this.rbac.getPermissionsForRole(user.role);
    if (perms.includes('artigos.editar_todos')) return;
    if (perms.includes('artigos.editar_proprios') && article.authorId === user.id) {
      return;
    }
    throw new ForbiddenException('Sem permissão para editar este artigo.');
  }

  // ── admin ──────────────────────────────────────────────────────────
  /**
   * Returns total counts by status across the ENTIRE article corpus,
   * regardless of any filters applied to the list view. Used by the
   * admin /admin/artigos stats row so the numbers don't shrink to
   * just the visible page (e.g. "33 total → 20 on page 1 → 13 on
   * page 2" was the bug we're fixing).
   *
   * Single query via `groupBy` is preferred over multiple counts:
   * Postgres scans the table once with a HashAggregate.
   */
  async getStats() {
    const [groups, viewsAgg] = await Promise.all([
      this.prisma.article.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.article.aggregate({ _sum: { views: true } }),
    ]);
    const byStatus: Record<string, number> = {
      RASCUNHO: 0,
      EM_REVISAO: 0,
      AGENDADO: 0,
      PUBLICADO: 0,
      ARQUIVADO: 0,
    };
    let total = 0;
    for (const g of groups) {
      byStatus[g.status] = g._count._all;
      total += g._count._all;
    }
    return {
      total,
      byStatus,
      totalViews: viewsAgg._sum.views ?? 0,
    };
  }

  async list(
    query: ListArticlesQueryDto,
  ): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);
    const where: Record<string, unknown> = {};
    if (query.status?.length) where.status = { in: query.status };
    if (query.category) {
      // Opt-in in the CMS — see includeDescendants on the DTO.
      Object.assign(
        where,
        await this.categoryWhere(
          query.category,
          this.funnelEnabled && query.includeDescendants === true,
        ),
      );
    }
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { summary: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { slug: true, name: true, color: true } },
          author: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.article.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  async findOne(id: string) {
    return this.loadOrThrow(id);
  }

  async create(dto: CreateArticleDto, user: ActingUser) {
    await this.ensureCategory(dto.categoryId);
    const slug = dto.slug ?? slugify(dto.title);
    try {
      const created = await this.prisma.article.create({
        data: {
          title: dto.title,
          slug,
          summary: dto.summary ?? '',
          content: dto.content ?? '',
          status: (dto.status as ArticleStatus) ?? 'RASCUNHO',
          exclusive: dto.exclusive ?? false,
          readMinutes: dto.readMinutes ?? 3,
          tags: dto.tags ?? [],
          essentials: dto.essentials ?? [],
          context: (dto.context as never) ?? null,
          pullQuote: (dto.pullQuote as never) ?? null,
          metaTitle: dto.metaTitle,
          metaDescription: dto.metaDescription,
          coverImageUrl: dto.coverImageUrl,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          categoryId: dto.categoryId,
          authorId: user.id,
        },
      });
      void this.activity.record({
        userId: user.id,
        action: 'submitted',
        targetType: 'article',
        targetId: created.id,
        targetLabel: created.title,
      });
      return created;
    } catch (e) {
      if (isPrismaCode(e, 'P2002')) {
        throw new ConflictException(`Slug "${slug}" já existe.`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateArticleDto, user: ActingUser) {
    const existing = await this.loadOrThrow(id);
    await this.assertCanEdit(existing, user);
    const data: Record<string, unknown> = { ...dto };
    if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);
    if (dto.slug === undefined && dto.title) {
      // keep existing slug if not explicitly changed
      delete data.slug;
    }
    // When an author re-edits an article that was rejected, the previous
    // rejection note is no longer relevant — clear it.
    if (existing.rejectionReason && existing.status === 'RASCUNHO') {
      data.rejectionReason = null;
    }
    try {
      const updated = await this.prisma.article.update({
        where: { id },
        data,
      });

      // Swapping the cover of an article that is already live, or
      // dropping a new image into its body. The piece is published, so
      // whatever it now points at has to be reachable — otherwise the
      // change goes out with a broken image on it.
      //
      // Only for articles that are actually live: on a draft the images
      // stay private, which is the point.
      if (updated.status === 'PUBLICADO') {
        await this.media.promoteForPublication(
          updated.coverImageUrl,
          updated.content,
        );
      }
      return updated;
    } catch (e) {
      if (isPrismaCode(e, 'P2002')) {
        throw new ConflictException('Slug já existe.');
      }
      throw e;
    }
  }

  /** The fields a pending draft carries. Mirrors what the editor edits. */
  private static readonly DRAFT_FIELDS = [
    'title',
    'slug',
    'summary',
    'content',
    'exclusive',
    'readMinutes',
    'tags',
    'essentials',
    'context',
    'pullQuote',
    'metaTitle',
    'metaDescription',
    'coverImageUrl',
    'categoryId',
  ] as const;

  private async canPublish(user: ActingUser): Promise<boolean> {
    if (user.role === 'SUPER_ADMIN') return true;
    const perms = await this.rbac.getPermissionsForRole(user.role);
    return perms.includes('artigos.publicar');
  }

  /**
   * Stores edits to an article WITHOUT touching what readers see.
   *
   * This is the autosave target for a live article. The alternative —
   * writing straight to the real columns, or flipping status to
   * RASCUNHO the way the manual "Guardar rascunho" button does — would
   * mean that fixing a comma on a published piece takes it off the site
   * the moment the author gets distracted. Here the live version stays
   * exactly as it was until somebody deliberately publishes the draft.
   *
   * `draftAwaitingReview` records whether the person who wrote it can
   * publish. A journalist's pending edit therefore lands in the approval
   * queue instead of being promotable by themselves.
   */
  async saveDraft(id: string, dto: UpdateArticleDto, user: ActingUser) {
    const existing = await this.loadOrThrow(id);
    await this.assertCanEdit(existing, user);

    const draft: Record<string, unknown> = {};
    for (const field of ArticlesService.DRAFT_FIELDS) {
      const value = (dto as Record<string, unknown>)[field];
      if (value !== undefined) draft[field] = value;
    }

    return this.prisma.article.update({
      where: { id },
      data: {
        draft: draft as never,
        draftUpdatedAt: new Date(),
        draftAwaitingReview: !(await this.canPublish(user)),
      },
    });
  }

  /**
   * Moves a pending draft into the live columns.
   *
   * Only meaningful for an article that is already published — for
   * anything else the editor writes straight through and there is no
   * draft to promote. Returns the article unchanged when there is
   * nothing pending, so callers can invoke it unconditionally.
   */
  async promoteDraft(id: string, user: ActingUser) {
    const existing = await this.loadOrThrow(id);
    if (!existing.draft) return existing;

    if (!(await this.canPublish(user))) {
      throw new ForbiddenException(
        'Sem permissão para publicar estas alterações.',
      );
    }

    const draft = existing.draft as Record<string, unknown>;
    const promoted = await this.prisma.article.update({
      where: { id },
      data: {
        ...draft,
        draft: Prisma.DbNull,
        draftUpdatedAt: null,
        draftAwaitingReview: false,
      },
    });
    void this.activity.record({
      userId: user.id,
      action: 'draft_promoted',
      targetType: 'article',
      targetId: existing.id,
      targetLabel: existing.title,
    });
    return promoted;
  }

  /** Throws away a pending draft; the live version is untouched. */
  async discardDraft(id: string, user: ActingUser) {
    const existing = await this.loadOrThrow(id);
    await this.assertCanEdit(existing, user);
    if (!existing.draft) return existing;

    const cleared = await this.prisma.article.update({
      where: { id },
      data: {
        draft: Prisma.DbNull,
        draftUpdatedAt: null,
        draftAwaitingReview: false,
      },
    });
    void this.activity.record({
      userId: user.id,
      action: 'draft_discarded',
      targetType: 'article',
      targetId: existing.id,
      targetLabel: existing.title,
    });
    return cleared;
  }

  /**
   * Author (or anyone with edit permission) puts a draft into the
   * approval queue. Allowed transitions: RASCUNHO → EM_REVISAO.
   * Optional `scheduledAt` is stored so the approver knows the desired
   * publication date.
   */
  async submitForReview(
    id: string,
    user: ActingUser,
    opts: { scheduledAt?: string | null } = {},
  ) {
    const a = await this.loadOrThrow(id);
    await this.assertCanEdit(a, user);
    if (a.status !== 'RASCUNHO' && a.status !== 'EM_REVISAO') {
      throw new ForbiddenException(
        'Só rascunhos podem ser submetidos para revisão.',
      );
    }
    const updated = await this.prisma.article.update({
      where: { id },
      data: {
        status: 'EM_REVISAO',
        scheduledAt: opts.scheduledAt ? new Date(opts.scheduledAt) : null,
        rejectionReason: null,
      },
    });
    void this.activity.record({
      userId: user.id,
      action: 'submitted_for_review',
      targetType: 'article',
      targetId: a.id,
      targetLabel: a.title,
    });
    return updated;
  }

  /**
   * Approver returns an article from the review queue back to the
   * author's drafts. Allowed transitions: EM_REVISAO → RASCUNHO.
   * `reason` is optional and surfaced both in the article row and the
   * activity log so the author can read it in /admin/artigos.
   */
  async reject(id: string, user: ActingUser, reason?: string) {
    const a = await this.loadOrThrow(id);
    const perms =
      user.role === 'SUPER_ADMIN'
        ? ['artigos.aprovar']
        : await this.rbac.getPermissionsForRole(user.role);
    if (!perms.includes('artigos.aprovar')) {
      throw new ForbiddenException('Sem permissão para aprovar/recusar.');
    }
    if (a.status !== 'EM_REVISAO') {
      throw new ForbiddenException(
        'Só artigos em revisão podem ser recusados.',
      );
    }
    const trimmedReason = reason?.trim().slice(0, 500) || null;
    const updated = await this.prisma.article.update({
      where: { id },
      data: {
        status: 'RASCUNHO',
        rejectionReason: trimmedReason,
        scheduledAt: null,
      },
    });
    void this.activity.record({
      userId: user.id,
      action: 'rejected',
      targetType: 'article',
      targetId: a.id,
      targetLabel: trimmedReason
        ? `${a.title} — "${trimmedReason}"`
        : a.title,
    });
    return updated;
  }

  /**
   * Publish an article immediately.
   * - If the caller has `artigos.publicar`: any non-PUBLICADO status
   *   transitions to PUBLICADO.
   * - If the caller does NOT have `artigos.publicar` but DOES have
   *   `artigos.submeter`: server-side fallback to submitForReview so a
   *   client mis-route never silently auto-publishes someone's draft.
   *
   * Clears any prior rejectionReason on success.
   */
  async publish(id: string, user: ActingUser) {
    const a = await this.loadOrThrow(id);
    const perms =
      user.role === 'SUPER_ADMIN'
        ? ['artigos.publicar', 'artigos.aprovar']
        : await this.rbac.getPermissionsForRole(user.role);
    if (!perms.includes('artigos.publicar')) {
      if (perms.includes('artigos.submeter')) {
        return this.submitForReview(id, user);
      }
      throw new ForbiddenException('Sem permissão para publicar.');
    }
    // A live article being re-published is the approver accepting the
    // pending edits — promote them in the same breath, or "Publicar"
    // would appear to do nothing on an article that is already live.
    const draft = (a.draft ?? {}) as Record<string, unknown>;
    const updated = await this.prisma.article.update({
      where: { id },
      data: {
        ...draft,
        status: 'PUBLICADO',
        publishedAt: new Date(),
        scheduledAt: null,
        rejectionReason: null,
        draft: Prisma.DbNull,
        draftUpdatedAt: null,
        draftAwaitingReview: false,
      },
    });
    // The images stop being drafts the moment the piece does. A reader
    // with no session, Googlebot and the robot that builds the link
    // preview all have to be able to load them, and none of them
    // authenticate.
    //
    // Awaited, not fire-and-forget: publishing and then serving a 404
    // cover for a few hundred milliseconds is exactly the window in
    // which somebody shares the link. It never throws — see
    // promoteForPublication.
    await this.media.promoteForPublication(
      updated.coverImageUrl,
      updated.content,
    );

    void this.activity.record({
      userId: user.id,
      action: 'published',
      targetType: 'article',
      targetId: a.id,
      targetLabel: a.title,
    });
    return updated;
  }

  async archive(id: string, user: ActingUser) {
    const a = await this.loadOrThrow(id);
    await this.assertCanEdit(a, user);
    const updated = await this.prisma.article.update({
      where: { id },
      data: { status: 'ARQUIVADO' },
    });
    void this.activity.record({
      userId: user.id,
      action: 'archived',
      targetType: 'article',
      targetId: a.id,
      targetLabel: a.title,
    });
    return updated;
  }

  async remove(id: string, user: ActingUser) {
    const a = await this.loadOrThrow(id);
    try {
      await this.prisma.article.delete({ where: { id } });
    } catch (e) {
      if (isPrismaCode(e, 'P2025')) {
        throw new NotFoundException('Artigo não encontrado.');
      }
      throw e;
    }
    void this.activity.record({
      userId: user.id,
      action: 'deleted',
      targetType: 'article',
      targetId: a.id,
      targetLabel: a.title,
    });
    return { ok: true };
  }

  // ── public ─────────────────────────────────────────────────────────
  /**
   * Articles authored by the given user that were submitted for
   * review and then rejected — i.e. now back in RASCUNHO with a
   * `rejectionReason` populated. Used by the dashboard banner to
   * tell the journalist that an editor sent something back so it
   * doesn't silently sit in "drafts" forever.
   *
   * Ordered by `updatedAt desc` so the most recent rejection is at
   * the top of the list.
   */
  async listMyRejected(userId: string) {
    return this.prisma.article.findMany({
      where: {
        authorId: userId,
        status: 'RASCUNHO',
        rejectionReason: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        slug: true,
        rejectionReason: true,
        updatedAt: true,
        category: { select: { slug: true, name: true, color: true } },
      },
    });
  }

  async listPublic(query: ListArticlesQueryDto): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);
    const where: Record<string, unknown> = { status: 'PUBLICADO' };
    if (query.category) {
      // The funnel, on the public side: opening "Portugal" shows
      // everything underneath it, opening "Funchal" narrows to that
      // branch. This is the feature.
      Object.assign(
        where,
        await this.categoryWhere(query.category, this.funnelEnabled),
      );
    }
    // Public search across title + summary. Uses the same case-
    // insensitive contains pattern as the admin list — same index
    // story, same expectations.
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { summary: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const orderBy =
      query.sort === 'views'
        ? { views: 'desc' as const }
        : { publishedAt: 'desc' as const };
    const [items, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        skip,
        take,
        orderBy,
        select: PUBLIC_ARTICLE_SELECT,
      }),
      this.prisma.article.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  /**
   * Same category first; only if that comes up short does it widen to the
   * PARENT's subtree — siblings and cousins, never the whole site.
   *
   * Widening on scarcity rather than always: a well-stocked category
   * should never show a neighbour's article, but a thin one (a brand new
   * "Sé" with two pieces in it) showing nothing is worse than showing
   * something from the Funchal.
   */
  async findRelated(slug: string, limit = 4) {
    const ref = await this.prisma.article.findUnique({
      where: { slug },
      select: { id: true, categoryId: true },
    });
    if (!ref) return [];

    const take = Math.min(Math.max(limit, 1), 10);

    const exact = await this.prisma.article.findMany({
      where: {
        status: 'PUBLICADO',
        categoryId: ref.categoryId,
        NOT: { id: ref.id },
      },
      orderBy: { publishedAt: 'desc' },
      take,
      select: PUBLIC_ARTICLE_SELECT,
    });
    if (!this.funnelEnabled || exact.length >= take) return exact;

    const node = await this.tree.getById(ref.categoryId);
    if (!node?.parentId) return exact;
    const ids = await this.tree.resolveSubtreeIdsById(node.parentId);
    if (ids.length === 0) return exact;

    const seen = [ref.id, ...exact.map((a) => a.id)];
    const extra = await this.prisma.article.findMany({
      where: {
        status: 'PUBLICADO',
        categoryId: { in: ids },
        NOT: { id: { in: seen } },
      },
      orderBy: { publishedAt: 'desc' },
      take: take - exact.length,
      select: PUBLIC_ARTICLE_SELECT,
    });
    return [...exact, ...extra];
  }

  /**
   * Whether this reader may read an exclusive in full.
   *
   * Asks the plan permission table rather than testing `plan ===
   * 'PREMIUM'` directly. The difference matters: what a subscription
   * buys is a question the newsroom answers on the permissions screen,
   * and hard-coding the plan name here would quietly make that screen
   * decorative.
   *
   * Anonymous is never entitled, and a reader with no matching plan row
   * falls back to that plan's defaults.
   */
  private async mayReadExclusive(reader?: { plan: string }): Promise<boolean> {
    if (!reader) return false;
    const perms = await this.rbac.getPermissionsForPlan(
      reader.plan as ReaderPlan,
    );
    return perms.includes('assinantes.ler_exclusivos');
  }

  async findPublicBySlug(slug: string, reader?: { plan: string }) {
    const a = await this.prisma.article.findFirst({
      where: { slug, status: 'PUBLICADO' },
      select: PUBLIC_ARTICLE_DETAIL_SELECT,
    });
    if (!a) throw new NotFoundException('Artigo não encontrado.');
    // Fire-and-forget view increment
    void this.prisma.article
      .update({ where: { id: a.id }, data: { views: { increment: 1 } } })
      .catch(() => undefined);

    if (!this.paywallEnabled || !a.exclusive) return a;
    if (await this.mayReadExclusive(reader)) return a;

    // `content` is DESTRUCTURED OUT, not blanked. An empty string would
    // still be a key in the JSON, and the next person to write
    // `article.content ?? article.contentPreview` would find the empty
    // string truthy-adjacent and ship a blank article. It simply is not
    // there.
    const { content, ...rest } = a;
    return {
      ...rest,
      paywalled: true,
      contentPreview: previewOf(content),
    };
  }

  async getHomepageBundle() {
    const articles = await this.prisma.article.findMany({
      where: { status: 'PUBLICADO' },
      orderBy: { publishedAt: 'desc' },
      take: 12,
      select: PUBLIC_ARTICLE_SELECT,
    });
    const [featured, ...rest] = articles;
    return {
      featured: featured ?? null,
      // Hero side stack: 3 small cards next to the big featured.
      side: rest.slice(0, 3),
      latest: rest.slice(3, 7),
      investigation: rest.slice(7, 9),
    };
  }
}
