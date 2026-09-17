import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SocialConfig } from './social.config';
import { FacebookClient } from './facebook.client';
import { InstagramClient } from './instagram.client';
import { SocialImageController } from '../media/social-image.controller';
import type { SocialNetwork } from '../../generated/prisma/enums';

/**
 * Only articles published in the last day are ever considered.
 *
 * Second line of defence behind the migration backfill, exactly as in
 * ReaderNotificationsService: even if socialQueuedAt were somehow
 * cleared on old rows, the archive could not be pushed to Instagram
 * against a 100-per-day ceiling.
 */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Give up on a post after this many attempts. */
const MAX_ATTEMPTS = 3;

/** Instagram's documented caption ceiling. Facebook's is far higher. */
const CAPTION_MAX = 2200;

/** How much of the summary survives into a post before it is cut. */
const SUMMARY_MAX = 300;

/**
 * Publishing an article to the newspaper's social accounts.
 *
 * ── Why a poller and not a hook ───────────────────────────────────────
 *
 * An article reaches PUBLICADO through FIVE code paths and only three of
 * them go through ArticlesService.publish(): create() with an explicit
 * status, update() spreading the DTO, and the AGENDADO→PUBLICADO cron
 * all write the status directly. A hook inside publish() would be a hook
 * that silently misses the scheduler — which is how the evening's
 * scheduled pieces would be the ones that never got posted, and the
 * hardest case to notice.
 *
 * This is the same conclusion ReaderNotificationsService reached for the
 * same reason, so it is the same shape: an atomic claim on a nullable
 * column, then an outbox.
 *
 * There is a second, less obvious win. PackagesService.publish() marks
 * its articles `exclusive: true` AFTER calling publish() on each of
 * them, so at the moment publish() runs the flag is still stale. A hook
 * would read the wrong value; a poller running up to a minute later
 * reads the settled one.
 *
 * ── Why the claim before sending ──────────────────────────────────────
 *
 * The notification outbox does not claim a row before handing it to the
 * mailer, so two API instances can send the same digest twice. That was
 * an acceptable trade there. It is not acceptable here: a duplicated
 * e-mail is an annoyance, and a duplicated Instagram post is a thing the
 * newsroom has to go and delete by hand in front of its audience. So
 * every row is moved to A_ENVIAR with a conditional updateMany first,
 * and only the instance that wins that race calls Meta.
 */
@Injectable()
export class SocialPublishingService {
  private readonly logger = new Logger(SocialPublishingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SocialConfig,
    private readonly facebook: FacebookClient,
    private readonly instagram: InstagramClient,
  ) {}

  // ─────────────────────────────── enqueue ───────────────────────────────

  /**
   * Finds newly published articles and writes their outbox rows.
   *
   * Idempotent at two levels, like its sibling: the atomic claim on
   * socialQueuedAt, and @@unique([articleId, network]) behind
   * skipDuplicates. Safe to re-run forever and safe with several
   * instances.
   *
   * Exported rather than private so tests can drive it with a fixed
   * clock.
   */
  async enqueueDueArticles(now = new Date()): Promise<number> {
    this.config.warnIfUnconfigured();
    if (!this.config.enabled) return 0;

    const policy = await this.config.policy();
    if (!policy.facebookEnabled && !policy.instagramEnabled) return 0;

    const due = await this.prisma.article.findMany({
      where: {
        status: 'PUBLICADO',
        socialQueuedAt: null,
        publishedAt: { lte: now, gte: new Date(now.getTime() - LOOKBACK_MS) },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        coverImageUrl: true,
        category: { select: { name: true } },
      },
    });
    if (due.length === 0) return 0;

    const scheduledFor = new Date(now.getTime() + policy.delayMinutes * 60_000);
    let created = 0;

    for (const article of due) {
      // Atomic claim. If another instance got there first this matches
      // zero rows and we move on — no double queue.
      const claim = await this.prisma.article.updateMany({
        where: { id: article.id, socialQueuedAt: null },
        data: { socialQueuedAt: now },
      });
      if (claim.count !== 1) continue;

      const linkUrl = `${this.config.siteUrl}/artigo/${article.slug}`;
      const rows: {
        articleId: string;
        network: SocialNetwork;
        message: string;
        imageUrl: string | null;
        linkUrl: string;
        scheduledFor: Date;
      }[] = [];

      if (policy.facebookEnabled && this.facebook.configured) {
        rows.push({
          articleId: article.id,
          network: 'FACEBOOK',
          message: this.render(policy.facebookTemplate, article, linkUrl),
          // No image: this is a LINK post, and Facebook builds the card
          // from the article page's Open Graph tags.
          imageUrl: null,
          linkUrl,
          scheduledFor,
        });
      }

      if (policy.instagramEnabled && this.instagram.configured) {
        const imageUrl = this.jpegCover(article.coverImageUrl);
        if (imageUrl) {
          rows.push({
            articleId: article.id,
            network: 'INSTAGRAM',
            message: this.render(policy.instagramTemplate, article, linkUrl),
            imageUrl,
            linkUrl,
            scheduledFor,
          });
        } else {
          // Not an error and not a retry: Instagram has no post without
          // a picture, and an article with no cover of ours simply does
          // not go there. Said out loud because the alternative is a
          // newsroom wondering why that one piece never appeared.
          this.logger.log(
            `Artigo ${article.slug} sem capa convertível — Instagram ignorado.`,
          );
        }
      }

      if (rows.length === 0) continue;

      const { count } = await this.prisma.socialPost.createMany({
        data: rows,
        skipDuplicates: true,
      });
      created += count;
    }

    if (created > 0) {
      this.logger.log(
        `${created} publicação(ões) agendada(s) para as redes sociais.`,
      );
    }
    return created;
  }

  // ─────────────────────────────── deliver ───────────────────────────────

  /** Sends everything whose time has come. Returns how many went out. */
  async deliver(now = new Date()): Promise<number> {
    if (!this.config.enabled) return 0;

    const due = await this.prisma.socialPost.findMany({
      where: {
        status: 'AGENDADO',
        scheduledFor: { lte: now },
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { scheduledFor: 'asc' },
      take: 20,
    });

    let sent = 0;

    for (const post of due) {
      // THE claim. Only the instance that flips AGENDADO→A_ENVIAR gets
      // to call Meta; everyone else sees count 0 and walks away. Without
      // this, two API processes on one tick publish the same photo
      // twice, and Instagram has no quiet way to undo that.
      const claim = await this.prisma.socialPost.updateMany({
        where: { id: post.id, status: 'AGENDADO' },
        data: { status: 'A_ENVIAR' },
      });
      if (claim.count !== 1) continue;

      try {
        const result =
          post.network === 'FACEBOOK'
            ? await this.facebook.publish(post.message, post.linkUrl)
            : await this.instagram.publish(post.message, post.imageUrl ?? '');

        await this.prisma.socialPost.update({
          where: { id: post.id },
          data: {
            status: 'ENVIADO',
            sentAt: new Date(),
            lastError: null,
            remoteId: result.remoteId,
            remoteUrl: result.remoteUrl,
          },
        });
        sent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const attempts = post.attempts + 1;
        // Back to AGENDADO so the next tick picks it up — unless the
        // retries are spent, in which case it stops blocking the queue
        // and stays visible in the admin with the reason it failed.
        await this.prisma.socialPost.update({
          where: { id: post.id },
          data: {
            status: attempts >= MAX_ATTEMPTS ? 'FALHOU' : 'AGENDADO',
            attempts,
            lastError: message.slice(0, 500),
          },
        });
        this.logger.warn(
          `Falha a publicar ${post.network} do artigo ${post.articleId} (tentativa ${attempts}): ${message}`,
        );
      }
    }

    if (sent > 0) this.logger.log(`${sent} publicação(ões) enviada(s).`);
    return sent;
  }

  // ──────────────────────────────── admin ────────────────────────────────

  /** The queue behind the card in the article editor. */
  async forArticle(articleId: string) {
    const posts = await this.prisma.socialPost.findMany({
      where: { articleId },
      orderBy: { network: 'asc' },
    });
    return {
      configured: this.config.enabled,
      posts: posts.map((p) => this.view(p)),
    };
  }

  /** The queue and the history, for /admin/redes. */
  async list(limit = 60) {
    const posts = await this.prisma.socialPost.findMany({
      orderBy: [{ scheduledFor: 'desc' }],
      take: Math.min(Math.max(limit, 1), 200),
      include: {
        article: { select: { slug: true, title: true } },
      },
    });
    return posts.map((p) => ({
      ...this.view(p),
      articleSlug: p.article.slug,
      articleTitle: p.article.title,
    }));
  }

  /**
   * Rewriting the text before it goes out — the whole point of the
   * delay.
   *
   * Only while AGENDADO. Once a row is A_ENVIAR the request is already
   * in flight at Meta and editing the row here would change nothing
   * except what the admin claims was published, which is worse than
   * refusing.
   */
  async updateMessage(id: string, message: string) {
    const text = message.trim();
    if (!text) throw new BadRequestException('O texto não pode ficar vazio.');

    const { count } = await this.prisma.socialPost.updateMany({
      where: { id, status: 'AGENDADO' },
      data: { message: text.slice(0, CAPTION_MAX) },
    });
    if (count !== 1) {
      throw new BadRequestException(
        'Esta publicação já saiu ou já não está agendada.',
      );
    }
    return this.one(id);
  }

  /** Stopping it. Same window, same reason. */
  async cancel(id: string) {
    const { count } = await this.prisma.socialPost.updateMany({
      where: { id, status: 'AGENDADO' },
      data: { status: 'CANCELADO' },
    });
    if (count !== 1) {
      throw new BadRequestException(
        'Esta publicação já saiu ou já não está agendada.',
      );
    }
    return this.one(id);
  }

  /**
   * "Testar ligação".
   *
   * Asks each network something harmless and reports what came back.
   * Without this, a wrong token is a silent failure discovered days
   * later by someone wondering where the posts went.
   */
  async connectionStatus() {
    const out = {
      configured: this.config.enabled,
      facebook: { configured: this.facebook.configured } as Record<
        string,
        unknown
      >,
      instagram: { configured: this.instagram.configured } as Record<
        string,
        unknown
      >,
    };

    if (this.facebook.configured) {
      try {
        const page = await this.facebook.describe();
        out.facebook = { configured: true, ok: true, name: page.name };
      } catch (err) {
        out.facebook = {
          configured: true,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    if (this.instagram.configured) {
      try {
        const quota = await this.instagram.quota();
        out.instagram = {
          configured: true,
          ok: true,
          used: quota.used,
          cap: quota.cap,
        };
      } catch (err) {
        out.instagram = {
          configured: true,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return out;
  }

  // ──────────────────────────────── helpers ──────────────────────────────

  private async one(id: string) {
    const post = await this.prisma.socialPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException();
    return this.view(post);
  }

  private view(p: {
    id: string;
    network: SocialNetwork;
    status: string;
    message: string;
    imageUrl: string | null;
    linkUrl: string;
    scheduledFor: Date;
    attempts: number;
    lastError: string | null;
    remoteUrl: string | null;
    sentAt: Date | null;
  }) {
    return {
      id: p.id,
      network: p.network,
      status: p.status,
      message: p.message,
      imageUrl: p.imageUrl,
      linkUrl: p.linkUrl,
      scheduledFor: p.scheduledFor,
      attempts: p.attempts,
      lastError: p.lastError,
      remoteUrl: p.remoteUrl,
      sentAt: p.sentAt,
      /** Whether the newsroom can still change or stop this one. */
      editable: p.status === 'AGENDADO',
    };
  }

  /**
   * The cover, as something Instagram will accept.
   *
   * Null when the article's cover is not one of ours — a pasted external
   * URL or a seed path. See SocialImageController for why this converts
   * on the way out instead of storing a second file.
   */
  private jpegCover(coverImageUrl: string | null): string | null {
    const origin = this.config.apiOrigin;
    if (!coverImageUrl || !origin) return null;
    return SocialImageController.jpegUrlFor(coverImageUrl, origin);
  }

  /**
   * The caption.
   *
   * {link} resolves to nothing on Instagram at the template level rather
   * than here — the default Instagram template simply does not contain
   * it, because a caption cannot hold a clickable link and printing a
   * bare URL that nobody can tap is worse than printing none.
   */
  private render(
    template: string,
    article: {
      title: string;
      summary: string;
      category: { name: string };
    },
    linkUrl: string,
  ): string {
    const summary =
      article.summary.length > SUMMARY_MAX
        ? `${article.summary.slice(0, SUMMARY_MAX).trimEnd()}…`
        : article.summary;

    return (
      template
        .replaceAll('{titulo}', article.title)
        .replaceAll('{resumo}', summary)
        .replaceAll('{categoria}', article.category.name)
        .replaceAll('{link}', linkUrl)
        // A placeholder that resolved to nothing leaves its blank line
        // behind, and an article with no summary then posts a headline
        // followed by a hole. Seen on the first real article this was
        // run against. Three or more newlines collapse to a paragraph
        // break; a deliberate one in the template still survives.
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, CAPTION_MAX)
    );
  }
}
