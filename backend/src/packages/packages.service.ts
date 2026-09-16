import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { RbacService } from '../rbac/rbac.service';
import {
  ArticlesService,
  PUBLIC_ARTICLE_SELECT,
} from '../articles/articles.service';
import { PackageStripeService } from './package-stripe.service';
import { MediaService } from '../media/media.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { SetPackageArticlesDto } from './dto/set-package-articles.dto';
import { ListPackagesQueryDto } from './dto/list-packages.query.dto';
import { PageResult, toSkipTake } from '../common/dto/pagination.dto';
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

/**
 * States an article may NOT be in to sit inside a pacote.
 *
 * ARQUIVADO is off the site, so selling it is selling nothing. AGENDADO
 * has its own scheduler that will publish it on its own clock — two
 * things publishing the same row on different triggers is a race with no
 * winner worth having. Both are refused here as well as filtered out of
 * the picker: the picker is convenience, this is the rule.
 */
const FORBIDDEN_MEMBER_STATUSES = ['ARQUIVADO', 'AGENDADO'] as const;

/** Statuses that publishing the pacote will turn into PUBLICADO. */
const DRAFT_MEMBER_STATUSES = ['RASCUNHO', 'EM_REVISAO'] as const;

/** Admin shape. Public shapes never carry Stripe ids or the price source. */
const ADMIN_PACKAGE_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  coverImageUrl: true,
  priceCents: true,
  currency: true,
  status: true,
  includedInSubscription: true,
  stripeProductId: true,
  stripePriceId: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  _count: { select: { items: true, purchases: true } },
} as const;

@Injectable()
export class PackagesService {
  private readonly logger = new Logger(PackagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
    private readonly rbac: RbacService,
    private readonly articles: ArticlesService,
    private readonly stripe: PackageStripeService,
    private readonly media: MediaService,
  ) {}

  // ── admin CRUD ─────────────────────────────────────────────────────

  async list(query: ListPackagesQueryDto): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { name: { contains: query.q, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.package.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: ADMIN_PACKAGE_SELECT,
      }),
      this.prisma.package.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  /**
   * The dropdown in the article editor: id, name, status, nothing else.
   *
   * ARQUIVADO pacotes are left out — filing a new article into a retired
   * pacote is never the intent.
   */
  async options() {
    return this.prisma.package.findMany({
      where: { status: { in: ['RASCUNHO', 'PUBLICADO'] } },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, status: true },
    });
  }

  /**
   * One pacote for the admin editor.
   *
   * Members carry their CURRENT status and `exclusive`, because those two
   * drive everything the editor needs warning about: which articles
   * publishing will publish, and which are already live and still free.
   */
  async findOneForAdmin(id: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { id },
      select: {
        ...ADMIN_PACKAGE_SELECT,
        items: {
          orderBy: { position: 'asc' },
          select: {
            position: true,
            article: {
              select: {
                id: true,
                slug: true,
                title: true,
                status: true,
                exclusive: true,
                coverImageUrl: true,
                publishedAt: true,
                category: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!pkg) throw new NotFoundException('Pacote não encontrado.');
    return pkg;
  }

  async create(dto: CreatePackageDto, user: ActingUser) {
    const slug = dto.slug?.trim() || slugify(dto.name);
    if (!slug) {
      throw new BadRequestException('Não foi possível gerar um slug.');
    }
    try {
      const created = await this.prisma.package.create({
        data: {
          slug,
          name: dto.name.trim(),
          description: dto.description?.trim() ?? '',
          coverImageUrl: dto.coverImageUrl?.trim() || null,
          priceCents: dto.priceCents ?? 0,
          includedInSubscription: dto.includedInSubscription ?? true,
          createdById: user.id,
        },
        select: ADMIN_PACKAGE_SELECT,
      });
      void this.activity.record({
        userId: user.id,
        action: 'created',
        targetType: 'package',
        targetId: created.id,
        targetLabel: created.name,
      });
      return created;
    } catch (e) {
      if (isPrismaCode(e, 'P2002')) {
        throw new ConflictException('Já existe um pacote com esse slug.');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdatePackageDto, user: ActingUser) {
    const existing = await this.loadOrThrow(id);
    const priceChanged =
      dto.priceCents !== undefined && dto.priceCents !== existing.priceCents;

    try {
      const updated = await this.prisma.package.update({
        where: { id },
        data: {
          ...(dto.slug !== undefined ? { slug: dto.slug.trim() } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() }
            : {}),
          ...(dto.coverImageUrl !== undefined
            ? { coverImageUrl: dto.coverImageUrl.trim() || null }
            : {}),
          ...(dto.priceCents !== undefined
            ? { priceCents: dto.priceCents }
            : {}),
          ...(dto.includedInSubscription !== undefined
            ? { includedInSubscription: dto.includedInSubscription }
            : {}),
        },
        select: ADMIN_PACKAGE_SELECT,
      });

      // A published pacote is on sale, so its Stripe Product has to keep
      // agreeing with what the page says. A price change here mints a new
      // Price; sessions already open against the old one still complete at
      // the old amount, which is the correct answer to "what was I shown".
      if (updated.status === 'PUBLICADO') {
        await this.stripe.sync(updated.id);
        // Swapping the cover of a pacote already on sale publishes the
        // new file too. Without this the page silently loses its image
        // the moment somebody changes it, and only for readers.
        await this.media.promoteForPublication(updated.coverImageUrl);
      }
      if (priceChanged) {
        void this.activity.record({
          userId: user.id,
          action: 'price_changed',
          targetType: 'package',
          targetId: id,
          targetLabel: `${updated.name} — ${(dto.priceCents ?? 0) / 100} ${updated.currency}`,
        });
      }
      return updated;
    } catch (e) {
      if (isPrismaCode(e, 'P2002')) {
        throw new ConflictException('Já existe um pacote com esse slug.');
      }
      throw e;
    }
  }

  async remove(id: string, user: ActingUser) {
    const pkg = await this.loadOrThrow(id);
    const purchases = await this.prisma.packagePurchase.count({
      where: { packageId: id },
    });
    // Refused here rather than left to the FK's onDelete: Restrict, so the
    // editor gets a sentence instead of a 500. Either way it cannot
    // happen: somebody paid for this.
    if (purchases > 0) {
      throw new ConflictException(
        `Este pacote já tem ${purchases} compra(s) e não pode ser eliminado. Arquive-o em vez disso.`,
      );
    }
    await this.prisma.package.delete({ where: { id } });
    void this.activity.record({
      userId: user.id,
      action: 'deleted',
      targetType: 'package',
      targetId: id,
      targetLabel: pkg.name,
    });
    return { ok: true };
  }

  // ── membership ─────────────────────────────────────────────────────

  /**
   * Replace the pacote's article list, in the given order.
   *
   * Touches PackageArticle and NOTHING else. No purchase snapshot is read
   * or rewritten from here — that is the whole promise of the feature, and
   * the reason the two tables exist separately. An editor removing an
   * article takes it off the page for future buyers and takes nothing from
   * anyone who already paid.
   */
  async setArticles(
    id: string,
    dto: SetPackageArticlesDto,
    user: ActingUser,
  ) {
    const pkg = await this.loadOrThrow(id);

    // Dedupe while keeping the editor's order: the picker should not send
    // duplicates, and a composite PK would reject them anyway — as a 500
    // rather than the silent no-op that is obviously meant.
    const ids = [...new Set(dto.articleIds)];

    const found = await this.prisma.article.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, status: true },
    });
    if (found.length !== ids.length) {
      const missing = ids.filter((i) => !found.some((f) => f.id === i));
      throw new BadRequestException(
        `Artigos inexistentes: ${missing.join(', ')}`,
      );
    }
    const refused = found.filter((a) =>
      (FORBIDDEN_MEMBER_STATUSES as readonly string[]).includes(a.status),
    );
    if (refused.length > 0) {
      throw new BadRequestException(
        `Estes artigos não podem entrar num pacote (arquivados ou agendados): ${refused
          .map((a) => a.title)
          .join('; ')}`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.packageArticle.deleteMany({ where: { packageId: id } }),
      this.prisma.packageArticle.createMany({
        data: ids.map((articleId, index) => ({
          packageId: id,
          articleId,
          position: index,
        })),
      }),
    ]);

    void this.activity.record({
      userId: user.id,
      action: 'articles_set',
      targetType: 'package',
      targetId: id,
      targetLabel: `${pkg.name} — ${ids.length} artigo(s)`,
    });
    return this.findOneForAdmin(id);
  }

  /**
   * Which pacotes contain this article, for the "Pacote" field in the
   * article editor.
   *
   * Returns a list, not one, because the data model allows an article in
   * several pacotes — the multi-select on the pacote side can put it
   * there. The editor's single <select> only offers to CHANGE the
   * assignment when there is at most one; see assignArticle().
   */
  async packagesForArticle(articleId: string) {
    const rows = await this.prisma.packageArticle.findMany({
      where: { articleId },
      select: {
        package: { select: { id: true, name: true, status: true } },
      },
    });
    return rows.map((r) => r.package);
  }

  /**
   * File one article into one pacote — the article editor's side of the
   * relationship.
   *
   * Refuses when the article already sits in more than one pacote. A
   * single <select> cannot express "in two of them", so saving it would
   * have to silently drop one, and the one it dropped would be whichever
   * an editor deliberately added on the pacote screen. Better to say so
   * and send them where the multi-select is.
   *
   * As everywhere else here, this touches PackageArticle only. Nobody's
   * purchase snapshot is read or written.
   */
  async assignArticle(
    articleId: string,
    packageId: string | null,
    user: ActingUser,
  ) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, title: true, status: true },
    });
    if (!article) throw new NotFoundException('Artigo não encontrado.');
    if (
      (FORBIDDEN_MEMBER_STATUSES as readonly string[]).includes(article.status)
    ) {
      throw new BadRequestException(
        'Um artigo arquivado ou agendado não pode entrar num pacote.',
      );
    }

    const current = await this.prisma.packageArticle.findMany({
      where: { articleId },
      select: { packageId: true },
    });
    if (current.length > 1) {
      throw new ConflictException(
        'Este artigo está em vários pacotes. Faça a gestão em /admin/pacotes.',
      );
    }
    if (current[0]?.packageId === packageId) return { ok: true };

    const target = packageId ? await this.loadOrThrow(packageId) : null;

    await this.prisma.$transaction(async (tx) => {
      if (current.length > 0) {
        await tx.packageArticle.deleteMany({ where: { articleId } });
      }
      if (packageId) {
        // Appended, not inserted: the pacote's own screen is where order
        // is decided, and an article filed from the editor has no opinion
        // about where in the sequence it belongs.
        const last = await tx.packageArticle.findFirst({
          where: { packageId },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        await tx.packageArticle.create({
          data: {
            packageId,
            articleId,
            position: (last?.position ?? -1) + 1,
          },
        });
      }
    });

    void this.activity.record({
      userId: user.id,
      action: packageId ? 'article_assigned' : 'article_unassigned',
      targetType: 'package',
      targetId: packageId ?? current[0]?.packageId,
      targetLabel: target
        ? `${article.title} → ${target.name}`
        : `${article.title} retirado do pacote`,
    });
    return { ok: true };
  }

  // ── publish ────────────────────────────────────────────────────────

  /**
   * Publish the pacote: publish its drafts, make them exclusive, mint the
   * Stripe Price, put it on sale.
   *
   * This is the flow the newsroom actually wanted, and the reason a pacote
   * accepts drafts at all. A journalist writes the pieces, files each one
   * into the pacote while writing, and one click puts the set on sale
   * already closed. Publishing each article in the open first and closing
   * it afterwards would expose paid work for however long that took, so
   * that route does not exist.
   *
   * NOT one database transaction, and it cannot be: articles are published
   * through ArticlesService.publish(), which runs its own queries and its
   * own media promotion rather than accepting a transaction client.
   * Everything that can be refused is therefore checked BEFORE the first
   * write — membership, price, and the caller's right to publish articles
   * — so the only way to fail half-way is the database or Stripe going
   * away mid-loop. Re-running publish() after that is safe: every step is
   * idempotent.
   */
  async publish(id: string, user: ActingUser) {
    const pkg = await this.loadWithMembers(id);

    if (pkg.items.length === 0) {
      throw new BadRequestException(
        'Um pacote sem artigos não pode ser publicado.',
      );
    }
    if (pkg.priceCents <= 0) {
      throw new BadRequestException(
        'Defina um preço antes de publicar o pacote.',
      );
    }
    const refused = pkg.items
      .map((i) => i.article)
      .filter((a) =>
        (FORBIDDEN_MEMBER_STATUSES as readonly string[]).includes(a.status),
      );
    if (refused.length > 0) {
      throw new BadRequestException(
        `Retire estes artigos antes de publicar (arquivados ou agendados): ${refused
          .map((a) => a.title)
          .join('; ')}`,
      );
    }

    const drafts = pkg.items
      .map((i) => i.article)
      .filter((a) =>
        (DRAFT_MEMBER_STATUSES as readonly string[]).includes(a.status),
      );

    await this.assertMayPublishArticles(drafts, user);

    for (const article of drafts) {
      await this.articles.publish(article.id, user);
    }

    /*
     * EVERY member becomes exclusive, not only the drafts this publish
     * just published.
     *
     * This used to close only the drafts, and leave a member that was
     * already live and free exactly as it was — on the reasoning that
     * putting a free article behind a paywall removes from public view
     * something anybody could read yesterday, which an editor must not
     * do by accident. The admin warned about those and offered a
     * separate "Tornar exclusivos" button.
     *
     * The reasoning was right about the danger and wrong about where to
     * put the decision. What it produced in practice was a pacote on
     * sale whose articles were still free at their own URLs: the buyer
     * pays for something anybody can read, and nobody notices until a
     * reader does. Publishing a pacote IS the decision to sell what is
     * in it — there is no other reading of it — so it is the moment the
     * articles close.
     *
     * The protection moves to the confirmation: the admin names how many
     * live free articles are about to stop being free BEFORE the click,
     * which is where a warning is useful. Nothing is closed silently;
     * it is just no longer a second button somebody can forget.
     */
    const memberIds = pkg.items.map((i) => i.article.id);
    await this.prisma.article.updateMany({
      where: { id: { in: memberIds }, exclusive: false },
      data: { exclusive: true },
    });

    /*
     * The cover has to become reachable, or the storefront is broken.
     *
     * Uploaded media starts PRIVADO and /uploads refuses it to anybody
     * without a session — that is deliberate, and it is what stops an
     * unpublished investigation's photographs being fetched by anyone
     * who guesses the address. Publishing is what lifts it, and every
     * other publish path in the app does this: articles, the scheduler,
     * ads. The pacote publish did not, so the cover of every pacote on
     * sale 404'd for readers while looking fine in the admin, where the
     * session makes it visible.
     */
    await this.media.promoteForPublication(pkg.coverImageUrl);

    const stripeIds = await this.stripe.sync(id);

    const updated = await this.prisma.package.update({
      where: { id },
      data: {
        status: 'PUBLICADO',
        publishedAt: pkg.publishedAt ?? new Date(),
      },
      select: ADMIN_PACKAGE_SELECT,
    });

    this.logger.log(
      `Pacote ${id} publicado: ${drafts.length} artigo(s) publicados, ` +
        `price=${stripeIds.priceId ?? 'nenhum (Stripe não configurado)'}.`,
    );
    void this.activity.record({
      userId: user.id,
      action: 'published',
      targetType: 'package',
      targetId: id,
      targetLabel: `${pkg.name} — ${drafts.length} artigo(s) publicados`,
    });
    return updated;
  }

  /**
   * Publish the members still in draft, without touching Stripe.
   *
   * For a pacote already on sale that gained an article. The public page
   * lists only PUBLICADO members, so until this runs the new piece is
   * invisible to the people who bought the pacote.
   */
  async publishPendingArticles(id: string, user: ActingUser) {
    const pkg = await this.loadWithMembers(id);
    const drafts = pkg.items
      .map((i) => i.article)
      .filter((a) =>
        (DRAFT_MEMBER_STATUSES as readonly string[]).includes(a.status),
      );
    if (drafts.length === 0) {
      throw new BadRequestException('Não há artigos em rascunho neste pacote.');
    }
    await this.assertMayPublishArticles(drafts, user);

    for (const article of drafts) {
      await this.articles.publish(article.id, user);
    }
    await this.prisma.article.updateMany({
      where: { id: { in: drafts.map((a) => a.id) } },
      data: { exclusive: true },
    });

    void this.activity.record({
      userId: user.id,
      action: 'published_pending',
      targetType: 'package',
      targetId: id,
      targetLabel: `${pkg.name} — ${drafts.length} artigo(s)`,
    });
    return this.findOneForAdmin(id);
  }

  /**
   * Turn already-live, still-free members into exclusives.
   *
   * The explicit act that publish() deliberately refuses to do on its own.
   * Somebody has to decide to take a free article out of public view, and
   * this is them deciding.
   */
  async makeMembersExclusive(id: string, user: ActingUser) {
    const pkg = await this.loadWithMembers(id);
    const targets = pkg.items
      .map((i) => i.article)
      .filter((a) => a.status === 'PUBLICADO' && !a.exclusive);
    if (targets.length === 0) {
      throw new BadRequestException(
        'Todos os artigos publicados deste pacote já são exclusivos.',
      );
    }
    await this.prisma.article.updateMany({
      where: { id: { in: targets.map((a) => a.id) } },
      data: { exclusive: true },
    });
    void this.activity.record({
      userId: user.id,
      action: 'made_exclusive',
      targetType: 'package',
      targetId: id,
      targetLabel: `${pkg.name} — ${targets.length} artigo(s)`,
    });
    return this.findOneForAdmin(id);
  }

  async unpublish(id: string, user: ActingUser) {
    await this.loadOrThrow(id);
    // The articles stay published and stay exclusive. Unpublishing a
    // pacote takes it off sale; it does not retract journalism, and it
    // does not touch anybody's entitlement — PackagePurchaseItem never
    // consults Package.status, because they paid.
    const updated = await this.prisma.package.update({
      where: { id },
      data: { status: 'RASCUNHO' },
      select: ADMIN_PACKAGE_SELECT,
    });
    void this.activity.record({
      userId: user.id,
      action: 'unpublished',
      targetType: 'package',
      targetId: id,
      targetLabel: updated.name,
    });
    return updated;
  }

  // ── public reads ───────────────────────────────────────────────────

  /**
   * The /pacotes listing. Published only, newest first.
   *
   * `_count` rather than loading the items: the card shows a number.
   */
  async listPublic() {
    return this.prisma.package.findMany({
      where: { status: 'PUBLICADO' },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        coverImageUrl: true,
        priceCents: true,
        currency: true,
        includedInSubscription: true,
        publishedAt: true,
        _count: { select: { items: true } },
      },
    });
  }

  /**
   * The /pacotes/[slug] page.
   *
   * Articles project through the SAME PUBLIC_ARTICLE_SELECT the rest of
   * the public API uses — imported, not copied. It carries no `content`,
   * which is what makes this endpoint incapable of leaking a paid body
   * even if the paywall itself were wrong.
   *
   * Only PUBLICADO members are listed. A pacote on sale may hold a draft
   * (an editor adding to it), and that piece is nobody's business until it
   * runs.
   */
  async findPublicBySlug(slug: string) {
    const pkg = await this.prisma.package.findFirst({
      where: { slug, status: 'PUBLICADO' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        coverImageUrl: true,
        priceCents: true,
        currency: true,
        includedInSubscription: true,
        publishedAt: true,
        stripePriceId: true,
        items: {
          orderBy: { position: 'asc' },
          where: { article: { status: 'PUBLICADO' } },
          select: { article: { select: PUBLIC_ARTICLE_SELECT } },
        },
      },
    });
    if (!pkg) throw new NotFoundException('Pacote não encontrado.');

    const { stripePriceId, items, ...rest } = pkg;
    return {
      ...rest,
      // A boolean, not the id. Whether this pacote can currently take
      // money is all the page needs; the Price id is ours.
      purchasable: Boolean(stripePriceId),
      articles: items.map((i) => i.article),
    };
  }

  // ── helpers ────────────────────────────────────────────────────────

  private async loadOrThrow(id: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        priceCents: true,
        currency: true,
        publishedAt: true,
      },
    });
    if (!pkg) throw new NotFoundException('Pacote não encontrado.');
    return pkg;
  }

  private async loadWithMembers(id: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        priceCents: true,
        publishedAt: true,
        // Needed by publish(), which has to make the cover reachable —
        // see the promoteForPublication call there.
        coverImageUrl: true,
        items: {
          orderBy: { position: 'asc' },
          select: {
            article: {
              select: {
                id: true,
                title: true,
                status: true,
                exclusive: true,
              },
            },
          },
        },
      },
    });
    if (!pkg) throw new NotFoundException('Pacote não encontrado.');
    return pkg;
  }

  /**
   * Publishing a pacote full of drafts is publishing articles, so it needs
   * the right to publish articles.
   *
   * Checked here rather than left to ArticlesService.publish(), which
   * falls back to submitForReview() for a caller who may submit but not
   * publish. That fallback is right for its own route and wrong for this
   * one: it would leave the articles in review while the pacote went on
   * sale over the top of them, and the editor would be looking at a
   * storefront selling drafts.
   */
  private async assertMayPublishArticles(
    drafts: { id: string; title: string }[],
    user: ActingUser,
  ) {
    if (drafts.length === 0) return;
    if (user.role === 'SUPER_ADMIN') return;
    const perms = await this.rbac.getPermissionsForRole(user.role);
    if (perms.includes('artigos.publicar')) return;
    throw new ForbiddenException(
      `Publicar este pacote publicaria ${drafts.length} artigo(s) e não tem permissão para publicar artigos: ${drafts
        .map((a) => a.title)
        .join('; ')}. Peça a publicação por revisão.`,
    );
  }
}
