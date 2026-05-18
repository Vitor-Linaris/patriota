import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import {
  PageQueryDto,
  PageResult,
  toSkipTake,
} from '../common/dto/pagination.dto';
import type { Role } from '../rbac/rbac.constants';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateOwnDto } from './dto/update-own.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

interface ActingUser {
  id: string;
  role: Role;
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

  async list(query: PageQueryDto): Promise<PageResult<unknown>> {
    const { skip, take } = toSkipTake(query);
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: USER_PUBLIC_SELECT,
      }),
      this.prisma.user.count(),
    ]);
    return {
      items,
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  async invite(dto: InviteUserDto, actor: ActingUser) {
    const email = dto.email.toLowerCase();
    const temporaryPassword = randomBytes(8).toString('base64url');
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
}
