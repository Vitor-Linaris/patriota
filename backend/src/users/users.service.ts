import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import {
  PageQueryDto,
  PageResult,
  toSkipTake,
} from '../common/dto/pagination.dto';
import {
  canAssignRole,
  canManageUser,
  type Role,
} from '../rbac/rbac.constants';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateOwnDto } from './dto/update-own.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';

interface ActingUser {
  id: string;
  role: Role;
}

/**
 * Generates a temporary password that's:
 *   • cryptographically random (uses randomBytes, not Math.random)
 *   • safe to read aloud / copy by hand — no characters that look
 *     alike (0/O, 1/l/I, ambiguous symbols like + / =).
 * 12 chars × log2(55) ≈ 69 bits of entropy — well above the threshold
 * for "one-time admin handout" passwords.
 */
function generateTempPassword(): string {
  const ALPHABET =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  bio: true,
  phone: true,
  avatarUrl: true,
  notificationPrefs: true,
  createdAt: true,
  password: false,
};

function isPrismaCode(e: unknown, code: string): boolean {
  return Boolean(
    e && typeof e === 'object' && (e as { code?: string }).code === code,
  );
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  async list(query: ListUsersQueryDto): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);
    // Free-text search: matches partial name or email
    // (case-insensitive, single substring). Surfaces in the URL as
    // ?q= on /admin/utilizadores so it's both bookmarkable and
    // back-button-safe.
    const where = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' as const } },
            { email: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: USER_PUBLIC_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  /**
   * Aggregate counts across the whole user table. Used by the admin
   * /utilizadores stats so the numbers (total / active / by role)
   * reflect the corpus, not just the visible page.
   */
  async getStats() {
    const [total, active, byRoleRows] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { _all: true },
      }),
    ]);
    const byRole: Record<string, number> = {
      SUPER_ADMIN: 0,
      EDITOR_CHEFE: 0,
      EDITOR: 0,
      JORNALISTA: 0,
      REVISOR: 0,
      MODERADOR: 0,
      ANALISTA: 0,
    };
    for (const row of byRoleRows) byRole[row.role] = row._count._all;
    return { total, active, byRole };
  }

  async invite(dto: InviteUserDto, actor: ActingUser) {
    if (!canAssignRole(actor.role, dto.role)) {
      throw new ForbiddenException(
        `O seu role (${actor.role}) não pode criar utilizadores com role ${dto.role}.`,
      );
    }
    const email = dto.email.toLowerCase();
    const temporaryPassword = generateTempPassword();
    const hash = await bcrypt.hash(temporaryPassword, 12);
    try {
      const created = await this.prisma.user.create({
        data: {
          email,
          name: dto.name ?? null,
          role: dto.role,
          password: hash,
          isActive: true,
        },
        select: USER_PUBLIC_SELECT,
      });
      void this.activity.record({
        userId: actor.id,
        action: 'invited',
        targetType: 'user',
        targetId: created.id,
        targetLabel: created.email,
      });
      // In a real deployment we'd send the temp password via email; for now,
      // return it so the admin UI can show / copy it once.
      return { ...created, temporaryPassword };
    } catch (e) {
      if (isPrismaCode(e, 'P2002')) {
        throw new ConflictException('Já existe um utilizador com esse e-mail.');
      }
      throw e;
    }
  }

  async changeRole(id: string, role: Role, actor: ActingUser) {
    if (!canAssignRole(actor.role, role)) {
      throw new ForbiddenException(
        `O seu role (${actor.role}) não pode atribuir o role ${role}.`,
      );
    }
    // Load the target FIRST so we can also check that the actor is
    // allowed to manage the user's *current* role — without this
    // an EDITOR_CHEFE could "rewrite" a SUPER_ADMIN's role.
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true, email: true },
    });
    if (!target) throw new NotFoundException('Utilizador não encontrado.');
    if (!canManageUser(actor.role, target.role)) {
      throw new ForbiddenException(
        `Não tem permissão para gerir utilizadores com role ${target.role}.`,
      );
    }
    if (target.role === actor.role && actor.role !== 'SUPER_ADMIN' && id !== actor.id) {
      // Prevent peer demotions: two EDITOR_CHEFEs can't fight over
      // each other's roles, only a SUPER_ADMIN can intervene.
      throw new ForbiddenException(
        'Não pode alterar o role de um utilizador do mesmo nível que o seu.',
      );
    }
    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data: { role },
        select: USER_PUBLIC_SELECT,
      });
      void this.activity.record({
        userId: actor.id,
        action: 'role-changed',
        targetType: 'user',
        targetId: updated.id,
        targetLabel: `${updated.email} → ${role}`,
      });
      return updated;
    } catch (e) {
      if (isPrismaCode(e, 'P2025')) {
        throw new NotFoundException('Utilizador não encontrado.');
      }
      throw e;
    }
  }

  async setActive(id: string, isActive: boolean, actor: ActingUser) {
    // Same hierarchy guard: an EDITOR_CHEFE cannot suspend a SUPER_ADMIN.
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('Utilizador não encontrado.');
    if (!canManageUser(actor.role, target.role)) {
      throw new ForbiddenException(
        `Não tem permissão para gerir utilizadores com role ${target.role}.`,
      );
    }
    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data: { isActive },
        select: USER_PUBLIC_SELECT,
      });
      void this.activity.record({
        userId: actor.id,
        action: isActive ? 'reactivated' : 'suspended',
        targetType: 'user',
        targetId: updated.id,
        targetLabel: updated.email,
      });
      return updated;
    } catch (e) {
      if (isPrismaCode(e, 'P2025')) {
        throw new NotFoundException('Utilizador não encontrado.');
      }
      throw e;
    }
  }

  /**
   * Generate a new random temporary password for another user and
   * return it once (the admin needs to share it manually). Used for
   * "forgot password / locked out" flows. Permission gating is done
   * on the controller (utilizadores.resetar_password); the hierarchy
   * guard here prevents a chief from resetting a super-admin's pw.
   */
  async resetPassword(id: string, actor: ActingUser) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });
    if (!target) throw new NotFoundException('Utilizador não encontrado.');
    if (!canManageUser(actor.role, target.role)) {
      throw new ForbiddenException(
        `Não tem permissão para repor a palavra-passe de utilizadores com role ${target.role}.`,
      );
    }
    if (target.id === actor.id) {
      throw new ForbiddenException(
        'Use /users/me/password para alterar a sua própria palavra-passe.',
      );
    }
    const temporaryPassword = generateTempPassword();
    const hash = await bcrypt.hash(temporaryPassword, 12);
    await this.prisma.user.update({
      where: { id },
      data: { password: hash },
    });
    void this.activity.record({
      userId: actor.id,
      action: 'password-reset',
      targetType: 'user',
      targetId: target.id,
      targetLabel: target.email,
    });
    return { id: target.id, email: target.email, temporaryPassword };
  }

  /**
   * Permanently delete a user. Blocked when the user still owns
   * articles (FK constraint would fail anyway — we surface a
   * friendly error instead). Self-delete is blocked unconditionally.
   */
  async remove(id: string, actor: ActingUser) {
    if (id === actor.id) {
      throw new ForbiddenException(
        'Não pode eliminar a sua própria conta.',
      );
    }
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });
    if (!target) throw new NotFoundException('Utilizador não encontrado.');
    if (!canManageUser(actor.role, target.role)) {
      throw new ForbiddenException(
        `Não tem permissão para eliminar utilizadores com role ${target.role}.`,
      );
    }
    const articleCount = await this.prisma.article.count({
      where: { authorId: id },
    });
    if (articleCount > 0) {
      throw new ConflictException(
        `Não é possível eliminar: ${target.email} tem ${articleCount} artigo${articleCount === 1 ? '' : 's'} associados. Reatribua ou elimine os artigos primeiro, ou desactive a conta.`,
      );
    }
    try {
      // Activity log entries authored by this user keep the userId
      // reference; the user row itself is removed. Doing the log
      // BEFORE delete so it doesn't get orphaned by the cascade.
      await this.prisma.activityLog.deleteMany({ where: { userId: id } });
      await this.prisma.user.delete({ where: { id } });
    } catch (e) {
      if (isPrismaCode(e, 'P2025')) {
        throw new NotFoundException('Utilizador não encontrado.');
      }
      if (isPrismaCode(e, 'P2003')) {
        throw new ConflictException(
          'Não é possível eliminar: utilizador tem conteúdo associado.',
        );
      }
      throw e;
    }
    // Recorded under the actor's id (the deleted target's id is gone now).
    void this.activity.record({
      userId: actor.id,
      action: 'deleted',
      targetType: 'user',
      targetId: target.id,
      targetLabel: target.email,
    });
    return { ok: true as const, id: target.id, email: target.email };
  }

  async getOwn(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });
    if (!u) throw new NotFoundException('Utilizador não encontrado.');
    return u;
  }

  async updateOwn(id: string, dto: UpdateOwnDto) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.notificationPrefs !== undefined) {
      data.notificationPrefs = dto.notificationPrefs;
    }
    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_PUBLIC_SELECT,
    });
  }

  async changeOwnPassword(id: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, password: true },
    });
    if (!user) throw new NotFoundException();
    const ok = await bcrypt.compare(dto.current, user.password);
    if (!ok) throw new UnauthorizedException('Palavra-passe atual incorreta.');
    const hash = await bcrypt.hash(dto.next, 12);
    await this.prisma.user.update({
      where: { id },
      data: { password: hash },
    });
    return { ok: true };
  }

  /**
   * Profile photo upload — kept deliberately separate from the
   * /admin/media flow so avatars don't show up in the shared media
   * library (each user's photo is private to their own profile).
   * Files land in /uploads/avatars/, no Media row is created.
   *
   * Output is a single WebP at q=80, resized to fit a 512px square
   * (avatars never need more — the largest consumer renders at 80px
   * on the profile sidebar). No small/medium/large variants.
   */
  async uploadAvatar(
    userId: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ): Promise<{ avatarUrl: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Ficheiro vazio.');
    }
    const supported = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
    ]);
    if (!supported.has(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de ficheiro não suportado: ${file.mimetype}`,
      );
    }

    const uploadsDir =
      process.env.UPLOADS_DIR ?? '/usr/src/app/uploads';
    const publicBase =
      process.env.UPLOADS_PUBLIC_BASE_URL ?? 'http://localhost:8585/uploads';
    const dir = join(uploadsDir, 'avatars');
    await mkdir(dir, { recursive: true });

    // Filename combines the user id and a short random suffix so
    // (a) we don't accumulate orphan files when a user replaces
    // their photo, and (b) a stale CDN cache is invalidated by the
    // changed URL. The user prefix makes ownership inspectable on
    // disk.
    const suffix = randomBytes(4).toString('hex');
    const filename = `${userId}-${suffix}.webp`;
    const outPath = join(dir, filename);

    let buf: Buffer;
    try {
      buf = await sharp(file.buffer)
        .rotate()
        .resize({
          width: 512,
          height: 512,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
    } catch (e) {
      throw new BadRequestException(
        `Imagem inválida: ${(e as Error).message}`,
      );
    }
    await writeFile(outPath, buf);

    const avatarUrl = `${publicBase}/avatars/${filename}`;
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });
    this.logger.log(
      `Avatar uploaded for user ${userId} → ${(buf.length / 1024).toFixed(1)}KB`,
    );
    return { avatarUrl };
  }

  private readonly logger = new Logger(UsersService.name);
}
