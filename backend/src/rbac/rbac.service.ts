import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  MODULES,
  ROLE_LABELS,
  ROLE_ORDER,
  Role,
} from './rbac.constants';

export interface MatrixResponse {
  roles: { key: Role; label: string }[];
  modules: typeof MODULES;
  totals: { totalPermissions: number; totalModules: number };
  current: Record<Role, string[]>;
  counts: Record<Role, { granted: number; percent: number }>;
}

@Injectable()
export class RbacService implements OnModuleInit {
  private readonly logger = new Logger(RbacService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensure every Role has a RolePermissions row on boot.
   * For new rows: seed with DEFAULT_ROLE_PERMISSIONS.
   * For existing rows: only ADD permissions that are in the default set
   * but missing from the row — never removes admin customisations.
   * Idempotent.
   */
  async onModuleInit() {
    try {
      for (const role of ROLE_ORDER) {
        const existing = await this.prisma.rolePermissions.findUnique({
          where: { role },
        });
        if (!existing) {
          await this.prisma.rolePermissions.create({
            data: { role, permissions: DEFAULT_ROLE_PERMISSIONS[role] },
          });
          continue;
        }
        const missing = DEFAULT_ROLE_PERMISSIONS[role].filter(
          (p) => !existing.permissions.includes(p),
        );
        if (missing.length > 0) {
          await this.prisma.rolePermissions.update({
            where: { role },
            data: { permissions: [...existing.permissions, ...missing] },
          });
          this.logger.log(
            `Added ${missing.length} new default permission(s) to ${role}: ${missing.join(', ')}`,
          );
        }
      }
    } catch (err) {
      // Table may not exist yet on first boot before `migrate deploy` ran.
      this.logger.warn(
        `RolePermissions bootstrap skipped: ${(err as Error).message}`,
      );
    }
  }

  async getPermissionsForRole(role: Role): Promise<string[]> {
    if (role === 'SUPER_ADMIN') return [...ALL_PERMISSIONS];
    const row = await this.prisma.rolePermissions.findUnique({ where: { role } });
    return row?.permissions ?? DEFAULT_ROLE_PERMISSIONS[role];
  }

  async getMatrix(): Promise<MatrixResponse> {
    const rows = await this.prisma.rolePermissions.findMany();
    const current: Record<Role, string[]> = Object.fromEntries(
      ROLE_ORDER.map((r) => [
        r,
        r === 'SUPER_ADMIN'
          ? [...ALL_PERMISSIONS]
          : rows.find((x) => x.role === r)?.permissions ??
            DEFAULT_ROLE_PERMISSIONS[r],
      ]),
    ) as Record<Role, string[]>;

    const total = ALL_PERMISSIONS.length;
    const counts = Object.fromEntries(
      ROLE_ORDER.map((r) => {
        const g = current[r].length;
        return [r, { granted: g, percent: Math.round((g / total) * 100) }];
      }),
    ) as Record<Role, { granted: number; percent: number }>;

    return {
      roles: ROLE_ORDER.map((r) => ({ key: r, label: ROLE_LABELS[r] })),
      modules: MODULES,
      totals: { totalPermissions: total, totalModules: MODULES.length },
      current,
      counts,
    };
  }

  async updateRolePermissions(role: Role, permissions: string[]) {
    if (role === 'SUPER_ADMIN') {
      throw new BadRequestException('SUPER_ADMIN é imutável.');
    }
    const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalid.length) {
      throw new BadRequestException(
        `Permissões desconhecidas: ${invalid.join(', ')}`,
      );
    }
    return this.prisma.rolePermissions.upsert({
      where: { role },
      update: { permissions },
      create: { role, permissions },
    });
  }
}
