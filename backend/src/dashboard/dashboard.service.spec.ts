import { Test } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { VisitsService } from '../visits/visits.service';
import { RbacService } from '../rbac/rbac.service';

/**
 * /admin/stats carried no @RequirePermissions at all, and a route with
 * no metadata is not visibly open: RolesGuard passes silently when it
 * finds nothing to check. Every authenticated account — a freelancer
 * with a JORNALISTA login included — read how many unpublished pieces
 * the newsroom was sitting on and how many staff accounts existed, both
 * of which the sibling routes gate explicitly.
 */
describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: { article: { count: jest.Mock }; user: { count: jest.Mock } };
  let visits: { getCounts: jest.Mock };
  let perms: string[];

  beforeEach(async () => {
    perms = [];
    prisma = {
      article: { count: jest.fn().mockResolvedValue(7) },
      user: { count: jest.fn().mockResolvedValue(11) },
    };
    visits = {
      getCounts: jest.fn().mockResolvedValue({ today: 1, week: 2, month: 3 }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: VisitsService, useValue: visits },
        {
          provide: RbacService,
          useValue: { getPermissionsForRole: jest.fn(async () => perms) },
        },
      ],
    }).compile();
    service = moduleRef.get(DashboardService);
  });

  const jornalista = { id: 'u1', role: 'JORNALISTA' as const };

  it('withholds the staff head count from a role without utilizadores.ver', async () => {
    const out = await service.getStats(jornalista);

    expect(out.users).toBeNull();
    // null and not 0: the card must be able to tell "not for you" from
    // "none", or it reports a newsroom of zero people.
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('withholds the visit counts without analytics.basicas', async () => {
    const out = await service.getStats(jornalista);

    expect(out.visits).toBeNull();
    expect(visits.getCounts).not.toHaveBeenCalled();
  });

  it('counts only the caller’s own articles without artigos.ler_todos', async () => {
    await service.getStats(jornalista);

    for (const call of prisma.article.count.mock.calls) {
      expect((call[0] as { where: { authorId?: string } }).where.authorId).toBe(
        'u1',
      );
    }
  });

  it('counts the whole corpus for a role that may read it all', async () => {
    perms = ['artigos.ler_todos'];

    await service.getStats(jornalista);

    for (const call of prisma.article.count.mock.calls) {
      expect(
        (call[0] as { where: { authorId?: string } }).where.authorId,
      ).toBeUndefined();
    }
  });

  it('gives a SUPER_ADMIN everything without consulting the matrix', async () => {
    const out = await service.getStats({ id: 'root', role: 'SUPER_ADMIN' });

    expect(out.users).toEqual({ total: 11 });
    expect(out.visits).toEqual({ today: 1, week: 2, month: 3 });
  });
});
