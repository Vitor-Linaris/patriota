import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_ORDER,
  type Role,
} from '../rbac/rbac.constants';
import type { StaffNotificationType } from '../../generated/prisma/enums';

/**
 * The permission that makes a role eligible for each notification
 * area. Deliberately NOT the same lookup RbacService already does for
 * routes — that answers "may THIS user do X"; this answers "who among
 * EVERYONE currently holds the permission for X", which is a different
 * question and the one this outbox actually asks, on every event.
 *
 * Kept independent of RbacModule on purpose: RbacService.
 * updateRolePermissions() is itself one of the triggers below
 * (PERMISSOES), and importing RbacModule here would make RbacModule
 * import this module right back for that call — a cycle. Reading
 * RolePermissions directly, with the same fallback to
 * DEFAULT_ROLE_PERMISSIONS the real service uses, costs a few lines and
 * avoids it entirely.
 */
const RECIPIENT_PERMISSION: Partial<Record<StaffNotificationType, string>> = {
  ARTIGO_REVISAO: 'artigos.aprovar',
  PACOTE: 'pacotes.ver',
  UTILIZADOR: 'utilizadores.editar',
  PERMISSOES: 'configuracoes.permissoes',
  COMENTARIO: 'comentarios.eliminar',
  CATEGORIA: 'categorias.editar',
  PUBLICIDADE: 'configuracoes.editar',
  CONFIGURACOES: 'configuracoes.editar',
  // ARTIGO_PUBLICADO is deliberately absent: it goes to one specific
  // person (the author), never to "whoever holds a permission" — see
  // notifyAuthorPublished below.
};

export interface NotifyAreaInput {
  type: Exclude<StaffNotificationType, 'ARTIGO_PUBLICADO'>;
  title: string;
  href?: string;
  /** Never notify this person, even if they hold the permission —
   *  the one who did the thing does not need telling about it. */
  excludeUserId?: string;
}

/**
 * The bell. An outbox of already-delivered rows, not a queue — nothing
 * here retries or expires, unlike ArticleNotification or SocialPost. The
 * only thing that ever changes after a row is written is `readAt`.
 *
 * Two shapes of event:
 *  - "area" events (notify()) — whoever currently holds the relevant
 *    permission, each filtered by their own opt-out in
 *    User.staffNotifPrefs.
 *  - the one personal event (notifyAuthorPublished()) — always and only
 *    the author, because it is about something that happened TO them,
 *    not something they administer.
 */
@Injectable()
export class StaffNotificationsService {
  private readonly logger = new Logger(StaffNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every role that currently holds `permission` — reading the live
   * RBAC override table, with the same fallback to the shipped
   * defaults getPermissionsForRole uses. SUPER_ADMIN always holds
   * everything and is never stored as a row, exactly like that method.
   */
  private async rolesWithPermission(permission: string): Promise<Role[]> {
    const rows = await this.prisma.rolePermissions.findMany({
      select: { role: true, permissions: true },
    });
    const overrides = new Map(rows.map((r) => [r.role, r.permissions]));

    const roles: Role[] = ['SUPER_ADMIN'];
    for (const role of ROLE_ORDER) {
      if (role === 'SUPER_ADMIN') continue;
      const perms = overrides.get(role) ?? DEFAULT_ROLE_PERMISSIONS[role];
      if (perms.includes(permission)) roles.push(role);
    }
    return roles;
  }

  /**
   * Fans a notification out to everyone eligible for its area.
   *
   * Fire-and-forget from every call site, exactly like
   * ActivityLogService.record() — a notification that fails to write
   * must never take the actual action (publishing a pacote, saving a
   * permission) down with it.
   */
  async notify(input: NotifyAreaInput): Promise<void> {
    try {
      const permission = RECIPIENT_PERMISSION[input.type];
      if (!permission) return; // unreachable given the input type, kept as a guard
      const roles = await this.rolesWithPermission(permission);

      const candidates = await this.prisma.user.findMany({
        where: {
          role: { in: roles },
          isActive: true,
          ...(input.excludeUserId ? { id: { not: input.excludeUserId } } : {}),
        },
        select: { id: true, staffNotifPrefs: true },
      });

      // Absent key = ON. See the schema comment on staffNotifPrefs for
      // why the omission is the safe default here, not the reverse.
      const recipients = candidates.filter((u) => {
        const prefs = (u.staffNotifPrefs ?? {}) as Record<string, unknown>;
        return prefs[input.type] !== false;
      });
      if (recipients.length === 0) return;

      await this.prisma.staffNotification.createMany({
        data: recipients.map((u) => ({
          recipientId: u.id,
          type: input.type,
          title: input.title,
          href: input.href,
        })),
      });
    } catch (err) {
      this.logger.warn(
        `notify(${input.type}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * The one personal notification: your own piece went out. No
   * permission check — anyone can be an author — only that person's
   * own opt-out.
   */
  async notifyAuthorPublished(input: {
    authorId: string;
    title: string;
    href?: string;
  }): Promise<void> {
    try {
      const author = await this.prisma.user.findUnique({
        where: { id: input.authorId },
        select: { staffNotifPrefs: true },
      });
      if (!author) return;
      const prefs = (author.staffNotifPrefs ?? {}) as Record<string, unknown>;
      if (prefs.ARTIGO_PUBLICADO === false) return;

      await this.prisma.staffNotification.create({
        data: {
          recipientId: input.authorId,
          type: 'ARTIGO_PUBLICADO',
          title: input.title,
          href: input.href,
        },
      });
    } catch (err) {
      this.logger.warn(
        `notifyAuthorPublished failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * The poller half of "the author is told their piece went out".
   *
   * An article reaches PUBLICADO through five code paths and only three
   * go through ArticlesService.publish() — the same fact that already
   * shaped ArticleNotification and SocialPost. A hook in publish() would
   * silently miss the scheduler and the two paths through create()/
   * update(), which is exactly the case most likely to matter here: a
   * piece scheduled for the evening is the one nobody is watching when
   * it goes out.
   *
   * Same claim discipline as its two siblings: atomic updateMany first,
   * so two API instances racing on the same tick converge on one
   * notification each, never two.
   */
  async enqueueAuthorNotifications(now = new Date()): Promise<number> {
    const LOOKBACK_MS = 24 * 60 * 60 * 1000;
    const due = await this.prisma.article.findMany({
      where: {
        status: 'PUBLICADO',
        authorNotifiedAt: null,
        publishedAt: { lte: now, gte: new Date(now.getTime() - LOOKBACK_MS) },
      },
      select: { id: true, title: true, slug: true, authorId: true },
    });
    if (due.length === 0) return 0;

    let sent = 0;
    for (const article of due) {
      const claim = await this.prisma.article.updateMany({
        where: { id: article.id, authorNotifiedAt: null },
        data: { authorNotifiedAt: now },
      });
      if (claim.count !== 1) continue;

      await this.notifyAuthorPublished({
        authorId: article.authorId,
        title: `O seu artigo "${article.title}" foi publicado.`,
        href: `/admin/artigos?id=${article.slug}`,
      });
      sent += 1;
    }
    return sent;
  }

  // ──────────────────────────────── reading ──────────────────────────────

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.staffNotification.count({
      where: { recipientId: userId, readAt: null },
    });
  }

  async list(userId: string, limit = 20) {
    const [items, unread] = await Promise.all([
      this.prisma.staffNotification.findMany({
        where: { recipientId: userId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 50),
      }),
      this.unreadCount(userId),
    ]);
    return { items, unread };
  }

  /** Only the recipient's own row — `where` includes recipientId as
   *  the ownership check, not a separate lookup-then-compare. */
  async markRead(id: string, userId: string): Promise<void> {
    await this.prisma.staffNotification.updateMany({
      where: { id, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.staffNotification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
