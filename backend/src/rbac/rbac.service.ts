import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALL_PERMISSIONS,
  ALL_PLAN_PERMISSIONS,
  DEFAULT_PLAN_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  MODULES,
  PLAN_LABELS,
  PLAN_MODULES,
  PLAN_ORDER,
  ROLE_LABELS,
  ROLE_ORDER,
  ReaderPlan,
  Role,
} from './rbac.constants';

/**
 * Drops permissions that are no longer in the catalogue.
 *
 * A key retired from MODULES stays behind in whatever RolePermissions
 * rows already had it — nothing goes back to clean them. That was
 * harmless for authorisation (a guard only ever asks for keys that
 * exist), but it broke the permissions screen outright: the matrix
 * handed the browser the stale keys, the browser sent them back on
 * save, and updateRolePermissions() rejected the lot as unknown. The
 * screen saves EVERY role on each click, so one stale row — publicidade
 * .ver and publicidade.editar, on EDITOR_CHEFE — was enough to make
 * every change to every role fail, with an error naming permissions the
 * administrator had never touched.
 *
 * Filtered on the way OUT rather than accepted on the way in: refusing
 * unknown keys on write is a real guard against typos and bad clients,
 * and worth keeping. The bug was an API that served something it would
 * not take back.
 */
function known(permissions: string[]): string[] {
  return permissions.filter((p) => ALL_PERMISSIONS.includes(p));
}

/**
 * The same, for the plan catalogue. Separate function rather than a
 * parameter, for the reason updatePlanPermissions() already gives:
 * sharing one check between the two catalogues is how
 * "assinantes.ler_exclusivos" ends up validated against the staff list.
 *
 * No plan key has been retired yet, so this filters nothing today. It is
 * here because the roles side above only became a bug the day one was.
 */
function knownPlan(permissions: string[]): string[] {
  return permissions.filter((p) => ALL_PLAN_PERMISSIONS.includes(p));
}

export interface MatrixResponse {
  roles: { key: Role; label: string }[];
  modules: typeof MODULES;
  totals: { totalPermissions: number; totalModules: number };
  current: Record<Role, string[]>;
  counts: Record<Role, { granted: number; percent: number }>;
  /**
   * The second axis: what each reader plan may do. Shipped in the same
   * payload as the roles because the screen shows them one under the
   * other, and two round trips for one page would be two chances for the
   * page to render half-populated.
   */
  plans: {
    keys: { key: ReaderPlan; label: string }[];
    modules: typeof PLAN_MODULES;
    total: number;
    current: Record<ReaderPlan, string[]>;
  };
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

    // Same treatment for the reader plans, in its own try: a failure
    // provisioning plans must not leave the roles half-done, and a
    // failure on roles must not stop the plans being created.
    try {
      for (const plan of PLAN_ORDER) {
        const existing = await this.prisma.planPermissions.findUnique({
          where: { plan },
        });
        if (!existing) {
          await this.prisma.planPermissions.create({
            data: { plan, permissions: DEFAULT_PLAN_PERMISSIONS[plan] },
          });
          continue;
        }
        const missing = DEFAULT_PLAN_PERMISSIONS[plan].filter(
          (p) => !existing.permissions.includes(p),
        );
        if (missing.length > 0) {
          await this.prisma.planPermissions.update({
            where: { plan },
            data: { permissions: [...existing.permissions, ...missing] },
          });
          this.logger.log(
            `Added ${missing.length} new default permission(s) to plan ${plan}: ${missing.join(', ')}`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        `PlanPermissions bootstrap skipped: ${(err as Error).message}`,
      );
    }
  }

  async getPermissionsForRole(role: Role): Promise<string[]> {
    if (role === 'SUPER_ADMIN') return [...ALL_PERMISSIONS];
    const row = await this.prisma.rolePermissions.findUnique({ where: { role } });
    return known(row?.permissions ?? DEFAULT_ROLE_PERMISSIONS[role]);
  }

  /**
   * What a reader on this plan may do.
   *
   * Nothing enforces this yet — the paywall is the first caller, and it
   * will read `assinantes.ler_exclusivos`. Shipping the storage and the
   * screen first means turning the paywall on is a decision the newsroom
   * makes in the UI rather than a deploy.
   *
   * No SUPER_ADMIN-style bypass here: PREMIUM has everything by default
   * but is editable, because "what does a subscription buy" is exactly
   * the question this table exists to let the newsroom answer.
   */
  async getPermissionsForPlan(plan: ReaderPlan): Promise<string[]> {
    const row = await this.prisma.planPermissions.findUnique({
      where: { plan },
    });
    return knownPlan(row?.permissions ?? DEFAULT_PLAN_PERMISSIONS[plan]);
  }

  async getMatrix(): Promise<MatrixResponse> {
    const rows = await this.prisma.rolePermissions.findMany();
    const current: Record<Role, string[]> = Object.fromEntries(
      ROLE_ORDER.map((r) => [
        r,
        r === 'SUPER_ADMIN'
          ? [...ALL_PERMISSIONS]
          : known(
              rows.find((x) => x.role === r)?.permissions ??
                DEFAULT_ROLE_PERMISSIONS[r],
            ),
      ]),
    ) as Record<Role, string[]>;

    const total = ALL_PERMISSIONS.length;
    const counts = Object.fromEntries(
      ROLE_ORDER.map((r) => {
        const g = current[r].length;
        return [r, { granted: g, percent: Math.round((g / total) * 100) }];
      }),
    ) as Record<Role, { granted: number; percent: number }>;

    const planRows = await this.prisma.planPermissions.findMany();
    const planCurrent = Object.fromEntries(
      PLAN_ORDER.map((p) => [
        p,
        knownPlan(
          planRows.find((x) => x.plan === p)?.permissions ??
            DEFAULT_PLAN_PERMISSIONS[p],
        ),
      ]),
    ) as Record<ReaderPlan, string[]>;

    return {
      roles: ROLE_ORDER.map((r) => ({ key: r, label: ROLE_LABELS[r] })),
      modules: MODULES,
      totals: { totalPermissions: total, totalModules: MODULES.length },
      current,
      counts,
      plans: {
        keys: PLAN_ORDER.map((p) => ({ key: p, label: PLAN_LABELS[p] })),
        modules: PLAN_MODULES,
        total: ALL_PLAN_PERMISSIONS.length,
        current: planCurrent,
      },
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

  async updatePlanPermissions(plan: ReaderPlan, permissions: string[]) {
    // Validated against the PLAN catalogue, never the staff one. Sharing
    // the check would let "assinantes.ler_exclusivos" be written into a
    // Role row, or "artigos.publicar" into a plan — either of which
    // would read as granted by anything that later trusts these lists.
    const invalid = permissions.filter(
      (p) => !ALL_PLAN_PERMISSIONS.includes(p),
    );
    if (invalid.length) {
      throw new BadRequestException(
        `Permissões de plano desconhecidas: ${invalid.join(', ')}`,
      );
    }
    return this.prisma.planPermissions.upsert({
      where: { plan },
      update: { permissions },
      create: { plan, permissions },
    });
  }
}
