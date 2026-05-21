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
import { ArticleStatus } from '../../generated/prisma/enums';
import {
  PageResult,
  toSkipTake,
} from '../common/dto/pagination.dto';
import type { Role } from '../rbac/rbac.constants';

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

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly rbac: RbacService,
  ) {}

  // ── helpers ────────────────────────────────────────────────────────
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
    if (query.category) where.category = { slug: query.category };
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
          premium: dto.premium ?? false,
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
      return await this.prisma.article.update({
        where: { id },
        data,
      });
    } catch (e) {
      if (isPrismaCode(e, 'P2002')) {
        throw new ConflictException('Slug já existe.');
      }
      throw e;
    }
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
    const updated = await this.prisma.article.update({
      where: { id },
      data: {
        status: 'PUBLICADO',
        publishedAt: new Date(),
        scheduledAt: null,
        rejectionReason: null,
      },
    });
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
  async listPublic(query: ListArticlesQueryDto): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);
    const where: Record<string, unknown> = { status: 'PUBLICADO' };
    if (query.category) where.category = { slug: query.category };
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
        include: {
          category: { select: { slug: true, name: true } },
          author: { select: { name: true } },
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

  async findRelated(slug: string, limit = 4) {
    const ref = await this.prisma.article.findUnique({
      where: { slug },
      select: { id: true, categoryId: true },
    });
    if (!ref) return [];
    return this.prisma.article.findMany({
      where: {
        status: 'PUBLICADO',
        categoryId: ref.categoryId,
        NOT: { id: ref.id },
      },
      orderBy: { publishedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 10),
      include: {
        category: { select: { slug: true, name: true } },
        author: { select: { name: true } },
      },
    });
  }

  async findPublicBySlug(slug: string) {
    const a = await this.prisma.article.findFirst({
      where: { slug, status: 'PUBLICADO' },
      include: {
        category: { select: { slug: true, name: true } },
        author: { select: { id: true, name: true } },
      },
    });
    if (!a) throw new NotFoundException('Artigo não encontrado.');
    // Fire-and-forget view increment
    void this.prisma.article
      .update({ where: { id: a.id }, data: { views: { increment: 1 } } })
      .catch(() => undefined);
    return a;
  }

  async getHomepageBundle() {
    const articles = await this.prisma.article.findMany({
      where: { status: 'PUBLICADO' },
      orderBy: { publishedAt: 'desc' },
      take: 12,
      include: {
        category: { select: { slug: true, name: true } },
        author: { select: { name: true } },
      },
    });
    const [featured, ...rest] = articles;
    return {
      featured: featured ?? null,
      side: rest.slice(0, 3),
      latest: rest.slice(3, 7),
      investigation: rest.slice(7, 9),
    };
  }
}
