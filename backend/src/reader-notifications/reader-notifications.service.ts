import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { digestTemplate, type DigestArticle } from './digest.template';
import type { DigestFrequency } from '../../generated/prisma/enums';
import { ConfigService } from '@nestjs/config';
import { CategoryTreeService } from '../categories/category-tree.service';

/**
 * Only articles published in the last day are ever considered.
 *
 * Second line of defence behind the migration backfill: even if
 * notificationsQueuedAt were somehow cleared on old rows, the archive
 * could not be fanned out to the whole readership.
 */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Readers per batch — never load the whole audience into memory. */
const FANOUT_BATCH = 1000;

/** Give up on a message after this many attempts. */
const MAX_ATTEMPTS = 3;

@Injectable()
export class ReaderNotificationsService {
  private readonly logger = new Logger(ReaderNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly tree: CategoryTreeService,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────────────── enqueue ───────────────────────────────

  /**
   * Finds newly published articles and fans them out to the readers who
   * follow their category.
   *
   * A poller, not a hook on publish, because an article reaches PUBLICADO
   * through four separate code paths — ArticlesService.publish(), the
   * scheduler cron, create() with an explicit status, and update()
   * spreading the DTO. Hooking the publish path would silently miss three
   * of them, and publish() is not even idempotent.
   *
   * Idempotent at two levels: the atomic claim on notificationsQueuedAt,
   * and the @@unique([readerId, articleId]) behind skipDuplicates. Safe to
   * re-run forever, and safe with several API instances.
   *
   * Exported (not private) so unit tests can drive it with a fixed clock.
   */
  async enqueueDueArticles(now = new Date()): Promise<number> {
    const due = await this.prisma.article.findMany({
      where: {
        status: 'PUBLICADO',
        notificationsQueuedAt: null,
        publishedAt: { lte: now, gte: new Date(now.getTime() - LOOKBACK_MS) },
      },
      select: { id: true, title: true, categoryId: true },
    });
    if (due.length === 0) return 0;

    let queued = 0;

    for (const article of due) {
      // Atomic claim. If another instance got there first the update
      // matches zero rows and we skip — no double fan-out.
      const claim = await this.prisma.article.updateMany({
        where: { id: article.id, notificationsQueuedAt: null },
        data: { notificationsQueuedAt: now },
      });
      if (claim.count !== 1) continue;

      // One fan-out per category, from the article's own up to the root.
      //
      // NOT a single widened `categoryId: { in: [...] }`: fanOut pages
      // with `cursor: { readerId_categoryId: ... }`, a composite key
      // bound to ONE categoryId. Widening the where would leave that
      // cursor non-unique in the ordering, and the loop would silently
      // skip or repeat whole pages of followers — the failure would look
      // like "some readers just didn't get it", which is close to
      // undebuggable in production.
      //
      // Repeating the fan-out is safe by construction: someone following
      // both Política and Política › Parlamento matches twice, and
      // @@unique([readerId, articleId]) with skipDuplicates collapses it
      // to one row, so one e-mail. At most four passes.
      for (const categoryId of await this.notifyTargets(article.categoryId)) {
        queued += await this.fanOut(article.id, categoryId);
      }
    }

    if (queued > 0) {
      this.logger.log(
        `Queued ${queued} notification(s) across ${due.length} article(s).`,
      );
    }
    return queued;
  }

  /**
   * Which categories should be notified for an article filed in
   * `categoryId`: itself, then its ancestors.
   *
   * Following "Política" means following what the section publishes,
   * including through its subsections — otherwise creating
   * "Política › Parlamento" would silently cut existing followers off
   * from coverage they had been receiving.
   *
   * Behind CATEGORY_FUNNEL, like the article listing: this is the same
   * promise to the reader, and it is the one part of it that sends
   * e-mail, so it gets the same kill switch. Off, the behaviour is
   * exactly what it was — the article's own category and nothing else.
   */
  private async notifyTargets(categoryId: string): Promise<string[]> {
    const raw = this.config.get<string>('CATEGORY_FUNNEL');
    if (raw === '0' || raw === 'false') return [categoryId];
    return this.tree.resolveAncestorIds(categoryId);
  }

  /** Rows for every eligible follower of the category, in batches. */
  private async fanOut(articleId: string, categoryId: string): Promise<number> {
    let cursor: string | undefined;
    let total = 0;

    for (;;) {
      const followers = await this.prisma.categoryFavorite.findMany({
        where: {
          categoryId,
          // The per-category mute. Deliberately distinct from unfollowing.
          notify: true,
          reader: {
            status: 'ATIVO',
            emailVerifiedAt: { not: null },
            notifyNewArticles: true,
            digestFrequency: { not: 'NUNCA' },
          },
        },
        select: { readerId: true },
        orderBy: { readerId: 'asc' },
        take: FANOUT_BATCH,
        ...(cursor
          ? { skip: 1, cursor: { readerId_categoryId: { readerId: cursor, categoryId } } }
          : {}),
      });
      if (followers.length === 0) break;

      const { count } = await this.prisma.articleNotification.createMany({
        data: followers.map((f) => ({ readerId: f.readerId, articleId })),
        skipDuplicates: true,
      });
      total += count;

      if (followers.length < FANOUT_BATCH) break;
      cursor = followers[followers.length - 1]!.readerId;
    }

    return total;
  }

  // ──────────────────────────────── deliver ────────────────────────────────

  /**
   * Drains pending notifications for readers on the given cadence,
   * grouping everything a reader is owed into ONE e-mail.
   *
   * Grouping is the whole point: a title publishing ten articles a day
   * that sends ten separate messages is how a newsroom gets marked as
   * spam by its own readers.
   */
  async deliver(frequency: DigestFrequency, now = new Date()): Promise<number> {
    // Master switch in /admin/configuracoes › Email, so the newsroom can
    // stop the digests without a deploy.
    if (!(await this.mailer.isEnabled('emailArticlePublished'))) {
      return 0;
    }

    const pending = await this.prisma.articleNotification.findMany({
      where: {
        status: 'PENDENTE',
        attempts: { lt: MAX_ATTEMPTS },
        reader: {
          status: 'ATIVO',
          notifyNewArticles: true,
          digestFrequency: frequency,
        },
      },
      select: {
        id: true,
        readerId: true,
        reader: {
          select: { email: true, name: true, unsubscribeToken: true },
        },
        article: {
          select: {
            slug: true,
            title: true,
            summary: true,
            // The opening of the piece, cut to ~200 words in the
            // template. A reader deciding whether to click needs more
            // than the one-line summary — that is what the summary is
            // FOR elsewhere (cards, search), not what makes somebody
            // open an e-mail.
            content: true,
            publishedAt: true,
            category: { select: { slug: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 5000,
    });
    if (pending.length === 0) return 0;

    // Group by reader — one message each, however many articles they owe.
    const byReader = new Map<string, typeof pending>();
    for (const row of pending) {
      const list = byReader.get(row.readerId);
      if (list) list.push(row);
      else byReader.set(row.readerId, [row]);
    }

    const siteName = await this.mailer.siteName();
    const siteUrl = this.mailer.siteUrl();
    let sent = 0;

    for (const [readerId, rows] of byReader) {
      const first = rows[0]!;
      const articles: DigestArticle[] = rows.map((r) => ({
        slug: r.article.slug,
        title: r.article.title,
        summary: r.article.summary,
        content: r.article.content,
        categoryName: r.article.category.name,
        categorySlug: r.article.category.slug,
      }));

      const rendered = digestTemplate(
        { siteName, siteUrl },
        {
          name: first.reader.name,
          articles,
          unsubscribeToken: first.reader.unsubscribeToken,
        },
      );

      const unsubUrl = `${siteUrl}/conta/notificacoes?t=${encodeURIComponent(
        first.reader.unsubscribeToken,
      )}`;
      const ids = rows.map((r) => r.id);

      try {
        await this.mailer.sendOrThrow({
          to: first.reader.email,
          ...rendered,
          tag: 'reader-digest',
          headers: {
            // RFC 8058. Gmail and Yahoo require one-click unsubscribe from
            // bulk senders; without these headers deliverability collapses.
            // The target accepts POST with no session and no CSRF token,
            // which is exactly why it is keyed on the reader's random
            // unsubscribeToken rather than a cookie.
            'List-Unsubscribe': `<${unsubUrl}&one_click=1>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });

        await this.prisma.articleNotification.updateMany({
          where: { id: { in: ids } },
          data: { status: 'ENVIADO', sentAt: now, lastError: null },
        });
        sent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.prisma.articleNotification.updateMany({
          where: { id: { in: ids } },
          data: { attempts: { increment: 1 }, lastError: message.slice(0, 500) },
        });
        this.logger.warn(
          `Digest to reader ${readerId} failed: ${message}`,
        );
      }
    }

    // Anything that burned through its retries stops blocking the queue.
    await this.prisma.articleNotification.updateMany({
      where: { status: 'PENDENTE', attempts: { gte: MAX_ATTEMPTS } },
      data: { status: 'FALHOU' },
    });

    if (sent > 0) {
      this.logger.log(`Sent ${sent} ${frequency} digest(s).`);
    }
    return sent;
  }

  /**
   * The ledger doubles as the dedupe memory, so pruning is conservative:
   * a row removed too early lets the same article be sent twice.
   */
  async pruneOldNotifications(now = new Date()): Promise<number> {
    const { count } = await this.prisma.articleNotification.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - 90 * 86_400_000) } },
    });
    return count;
  }

  // ────────────────────────────── unsubscribe ──────────────────────────────

  /** What a given token would act on — drives the confirmation page. */
  async describeUnsubscribe(token: string) {
    const reader = await this.prisma.reader.findUnique({
      where: { unsubscribeToken: token },
      select: {
        email: true,
        notifyNewArticles: true,
        digestFrequency: true,
        categoryFavorites: {
          where: { notify: true },
          select: { category: { select: { id: true, slug: true, name: true } } },
        },
      },
    });
    if (!reader) throw new NotFoundException('Ligação inválida.');

    return {
      // Masked: this page is reachable by anyone holding the link.
      email: reader.email.replace(/^(.).*(@.*)$/, '$1•••$2'),
      notifyNewArticles: reader.notifyNewArticles,
      digestFrequency: reader.digestFrequency,
      categories: reader.categoryFavorites.map((f) => f.category),
    };
  }

  /**
   * Performs the unsubscribe. Called from a POST only — mail clients and
   * corporate link scanners prefetch GET URLs, and a GET that mutated
   * would silently unsubscribe readers who never clicked anything.
   */
  async unsubscribe(
    token: string,
    opts: { categoryId?: string; all?: boolean },
  ) {
    const reader = await this.prisma.reader.findUnique({
      where: { unsubscribeToken: token },
      select: { id: true },
    });
    if (!reader) throw new NotFoundException('Ligação inválida.');

    if (opts.categoryId && !opts.all) {
      // Mute this category only — the reader keeps it on their dashboard.
      await this.prisma.categoryFavorite.updateMany({
        where: { readerId: reader.id, categoryId: opts.categoryId },
        data: { notify: false },
      });
      return { scope: 'categoria' as const };
    }

    await this.prisma.reader.update({
      where: { id: reader.id },
      data: { notifyNewArticles: false, digestFrequency: 'NUNCA' },
    });
    return { scope: 'todas' as const };
  }
}
