import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import {
  toSkipTake,
  type PageQueryDto,
  type PageResult,
} from '../common/dto/pagination.dto';
import type { CommentStatus } from '../../generated/prisma/enums';

/** How long an author may edit their own comment. */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** Hard cap; the DTO enforces it too, this is defence in depth. */
const MAX_BODY = 2000;

/**
 * Word cap on a comment.
 *
 * The 2000-character bound above stays: the two catch different things.
 * 200 words is roughly 1200 characters, so in normal prose this is the
 * limit that bites — enough for a complete argument, short of a
 * manifesto. The character cap still catches what a word count cannot
 * see: a pasted 1900-character URL, or one absurdly long unbroken
 * string, both of which count as a single word.
 */
export const MAX_WORDS = 200;

/**
 * Counts words the way a reader would.
 *
 * Split on whitespace rather than on `\b`: a regex word boundary counts
 * "não" as two words and "bem-vindo" as two, which would punish
 * Portuguese for being Portuguese.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export interface ActingStaff {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Strips every tag and collapses whitespace.
 *
 * Comment bodies are PLAIN TEXT, always. The article renderer uses
 * dangerouslySetInnerHTML for Tiptap output, and that reflex applied to a
 * comment would be stored XSS on every article page. Sanitising on write
 * AND rendering as {body} on read means both layers have to fail before
 * anything executes.
 */
export function stripTags(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_BODY);
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  /**
   * Daily-salted hash, mirroring the visitor hash in the frontend proxy:
   * usable as an abuse signal, stops being personal data after 24h.
   */
  private hashIp(ip: string | undefined): string | null {
    if (!ip) return null;
    const day = new Date().toISOString().slice(0, 10);
    return createHash('sha256').update(`${day}:${ip}`).digest('hex').slice(0, 32);
  }

  /** What the public thread exposes. Never the reader's e-mail. */
  private publicSelect() {
    return {
      id: true,
      body: true,
      status: true,
      parentId: true,
      createdAt: true,
      editedAt: true,
      reader: {
        select: { id: true, name: true, displayNamePublic: true, status: true },
      },
    } as const;
  }

  private shape(row: {
    id: string;
    body: string;
    status: CommentStatus;
    parentId: string | null;
    createdAt: Date;
    editedAt: Date | null;
    reader: {
      id: string;
      name: string | null;
      displayNamePublic: boolean;
      status: string;
    };
  }, viewerId?: string) {
    const anonymised = row.reader.status === 'ANONIMIZADO';
    return {
      id: row.id,
      body: row.status === 'ELIMINADO' ? null : row.body,
      status: row.status,
      parentId: row.parentId,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      author: {
        // An erased reader keeps their place in the thread without their
        // identity — see ReaderAuthService.anonymise.
        name: anonymised
          ? 'Leitor removido'
          : row.reader.displayNamePublic
            ? (row.reader.name ?? 'Leitor')
            : 'Leitor',
        isMe: viewerId !== undefined && row.reader.id === viewerId,
      },
    };
  }

  // ────────────────────────────── public read ──────────────────────────────

  /**
   * The thread for an article.
   *
   * A reader always sees their OWN pending comment (so posting does not
   * look like it failed), but nobody else's. That is the only reason this
   * endpoint takes an optional reader at all.
   */
  async listForArticle(
    slug: string,
    query: PageQueryDto,
    viewerId?: string,
  ): Promise<PageResult<unknown>> {
    const article = await this.prisma.article.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });
    if (!article || article.status !== 'PUBLICADO') {
      throw new NotFoundException('Notícia não encontrada.');
    }

    const visible = viewerId
      ? {
          OR: [
            { status: 'APROVADO' as const },
            { readerId: viewerId, status: { not: 'ELIMINADO' as const } },
          ],
        }
      : { status: 'APROVADO' as const };

    const where = { articleId: article.id, ...visible };
    const { skip, take } = toSkipTake(query);

    const [rows, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'asc' },
        select: this.publicSelect(),
      }),
      this.prisma.comment.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.shape(r, viewerId)),
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  // ───────────────────────────── reader writes ─────────────────────────────

  async create(
    slug: string,
    reader: { id: string; emailVerified: boolean },
    input: { body: string; parentId?: string },
    ip?: string,
  ) {
    // Unverified accounts cannot post. Otherwise anyone could spray
    // comments from throwaway addresses they never proved they own.
    if (!reader.emailVerified) {
      throw new ForbiddenException(
        'Confirme o seu e-mail antes de comentar.',
      );
    }

    const article = await this.prisma.article.findUnique({
      where: { slug },
      select: { id: true, status: true, title: true },
    });
    if (!article || article.status !== 'PUBLICADO') {
      throw new NotFoundException('Notícia não encontrada.');
    }

    const body = stripTags(input.body);
    if (body.length < 2) {
      throw new BadRequestException('O comentário é demasiado curto.');
    }
    // Counted AFTER stripTags, not in the DTO: the DTO sees the raw
    // input, so markup a reader never typed — pasted from a word
    // processor, say — would count against their limit.
    const words = countWords(body);
    if (words > MAX_WORDS) {
      throw new BadRequestException(
        `O comentário tem ${words} palavras. O limite é ${MAX_WORDS}.`,
      );
    }

    // Threads are capped at two levels. A reply to a reply is re-parented
    // onto the root rather than rejected — rejecting would be a confusing
    // dead end for the reader, and flat two-level threads render without
    // recursive queries.
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: input.parentId },
        select: { id: true, parentId: true, articleId: true, status: true },
      });
      if (!parent || parent.articleId !== article.id) {
        throw new NotFoundException('Comentário não encontrado.');
      }
      parentId = parent.parentId ?? parent.id;
    }

    const comment = await this.prisma.comment.create({
      data: {
        articleId: article.id,
        readerId: reader.id,
        parentId,
        body,
        ipHash: this.hashIp(ip),
      },
      select: this.publicSelect(),
    });

    return this.shape(comment, reader.id);
  }

  async update(commentId: string, readerId: string, rawBody: string) {
    const existing = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, readerId: true, createdAt: true, status: true },
    });
    if (!existing || existing.status === 'ELIMINADO') {
      throw new NotFoundException('Comentário não encontrado.');
    }
    if (existing.readerId !== readerId) {
      throw new ForbiddenException('Só pode editar os seus comentários.');
    }
    if (Date.now() - existing.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new ForbiddenException(
        'O prazo para editar este comentário terminou.',
      );
    }

    const body = stripTags(rawBody);
    if (body.length < 2) {
      throw new BadRequestException('O comentário é demasiado curto.');
    }
    // Counted AFTER stripTags, not in the DTO: the DTO sees the raw
    // input, so markup a reader never typed — pasted from a word
    // processor, say — would count against their limit.
    const words = countWords(body);
    if (words > MAX_WORDS) {
      throw new BadRequestException(
        `O comentário tem ${words} palavras. O limite é ${MAX_WORDS}.`,
      );
    }

    // An edit sends it back through moderation. Otherwise an approved
    // comment could be rewritten into anything after the fact.
    const comment = await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        body,
        editedAt: new Date(),
        status: 'PENDENTE',
        moderatedById: null,
        moderatedAt: null,
      },
      select: this.publicSelect(),
    });

    // It just left APROVADO, so the article total has to drop.
    if (existing.status === 'APROVADO') await this.syncCount(commentId);
    return this.shape(comment, readerId);
  }

  /** Soft delete — the row stays so replies keep their anchor. */
  async remove(commentId: string, readerId: string) {
    const existing = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, readerId: true, status: true },
    });
    if (!existing || existing.status === 'ELIMINADO') {
      throw new NotFoundException('Comentário não encontrado.');
    }
    if (existing.readerId !== readerId) {
      throw new ForbiddenException('Só pode eliminar os seus comentários.');
    }

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { status: 'ELIMINADO', body: '' },
    });
    await this.syncCount(commentId);
    return { removed: true };
  }

  async report(commentId: string, readerId: string) {
    const existing = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, readerId: true },
    });
    if (!existing) throw new NotFoundException('Comentário não encontrado.');
    if (existing.readerId === readerId) {
      throw new BadRequestException('Não pode denunciar o seu comentário.');
    }
    await this.prisma.comment.update({
      where: { id: commentId },
      data: { reportCount: { increment: 1 } },
    });
    return { reported: true };
  }

  /** "Em que notícias comentei" on the reader dashboard. */
  async listForReader(
    readerId: string,
    query: PageQueryDto & { since?: string },
  ): Promise<PageResult<unknown>> {
    const where: Record<string, unknown> = {
      readerId,
      status: { not: 'ELIMINADO' },
    };
    if (query.since) {
      const days = Number(query.since);
      if (Number.isFinite(days) && days > 0) {
        where.createdAt = { gte: new Date(Date.now() - days * 86_400_000) };
      }
    }

    const { skip, take } = toSkipTake(query);
    const [rows, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          body: true,
          status: true,
          createdAt: true,
          editedAt: true,
          article: {
            select: {
              slug: true,
              title: true,
              category: { select: { slug: true, name: true, color: true } },
            },
          },
        },
      }),
      this.prisma.comment.count({ where }),
    ]);

    return {
      items: rows,
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  // ────────────────────────────── moderation ──────────────────────────────

  async listForModeration(
    query: PageQueryDto & { status?: CommentStatus; q?: string },
  ): Promise<PageResult<unknown>> {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.q) where.body = { contains: query.q, mode: 'insensitive' };

    const { skip, take } = toSkipTake(query);
    const [items, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        skip,
        take,
        orderBy: [{ reportCount: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          body: true,
          status: true,
          parentId: true,
          reportCount: true,
          createdAt: true,
          editedAt: true,
          moderatedAt: true,
          moderationNote: true,
          reader: { select: { id: true, name: true, email: true, status: true } },
          moderatedBy: { select: { id: true, name: true } },
          article: { select: { slug: true, title: true } },
        },
      }),
      this.prisma.comment.count({ where }),
    ]);

    return { items, total, page: query.page ?? 1, pageSize: query.pageSize ?? 20 };
  }

  async stats() {
    const grouped = await this.prisma.comment.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const base: Record<string, number> = {
      PENDENTE: 0,
      APROVADO: 0,
      REJEITADO: 0,
      SPAM: 0,
      ELIMINADO: 0,
    };
    for (const g of grouped) base[g.status] = g._count._all;
    const reported = await this.prisma.comment.count({
      where: { reportCount: { gt: 0 }, status: { not: 'ELIMINADO' } },
    });
    return { ...base, REPORTADOS: reported };
  }

  async moderate(
    commentId: string,
    status: CommentStatus,
    staff: ActingStaff,
    note?: string,
  ) {
    const existing = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        body: true,
        articleId: true,
        article: { select: { title: true } },
      },
    });
    if (!existing) throw new NotFoundException('Comentário não encontrado.');

    await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        status,
        moderatedById: staff.id,
        moderatedAt: new Date(),
        moderationNote: note ?? null,
      },
    });

    await this.recount(existing.articleId);

    const action =
      status === 'APROVADO'
        ? 'comment_approved'
        : status === 'ELIMINADO'
          ? 'comment_deleted'
          : status === 'SPAM'
            ? 'comment_spam'
            : 'comment_rejected';

    void this.activity.record({
      userId: staff.id,
      action,
      targetType: 'comment',
      targetId: commentId,
      targetLabel: `${existing.article.title} — ${existing.body.slice(0, 60)}`,
    });

    return { id: commentId, status };
  }

  async bulkModerate(ids: string[], status: CommentStatus, staff: ActingStaff) {
    const rows = await this.prisma.comment.findMany({
      where: { id: { in: ids } },
      select: { id: true, articleId: true },
    });
    if (rows.length === 0) return { updated: 0 };

    await this.prisma.comment.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: {
        status,
        moderatedById: staff.id,
        moderatedAt: new Date(),
      },
    });

    for (const articleId of new Set(rows.map((r) => r.articleId))) {
      await this.recount(articleId);
    }

    void this.activity.record({
      userId: staff.id,
      action: 'comment_bulk_moderated',
      targetType: 'comment',
      targetLabel: `${rows.length} comentários → ${status}`,
    });

    return { updated: rows.length };
  }

  // ─────────────────────────── denormalised count ───────────────────────────

  /** Recomputes Article.commentCount from the comments themselves. */
  private async recount(articleId: string): Promise<void> {
    const total = await this.prisma.comment.count({
      where: { articleId, status: 'APROVADO' },
    });
    await this.prisma.article.update({
      where: { id: articleId },
      data: { commentCount: total },
    });
  }

  /** Same, resolved from a comment id. */
  private async syncCount(commentId: string): Promise<void> {
    const row = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { articleId: true },
    });
    if (row) await this.recount(row.articleId);
  }
}
