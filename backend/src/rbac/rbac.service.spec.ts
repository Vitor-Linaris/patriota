import { Test } from '@nestjs/testing';
import { RbacService } from './rbac.service';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSIONS } from './rbac.constants';

/**
 * The one thing these cover: what the matrix hands out has to be
 * something updateRolePermissions() will take back.
 *
 * A permission retired from the catalogue stays behind in the
 * RolePermissions rows that already had it. Serving those back made
 * every save on the permissions screen fail — the screen writes EVERY
 * role on each click, so a single stale row broke changes to roles that
 * had nothing to do with it, and named permissions the administrator
 * had never touched.
 */
describe('RbacService — retired permissions', () => {
  let service: RbacService;
  let prisma: {
    rolePermissions: { findMany: jest.Mock; findUnique: jest.Mock };
    planPermissions: { findMany: jest.Mock; findUnique: jest.Mock };
  };

  /** A key that is definitely not in the catalogue any more. */
  const RETIRED = 'publicidade.ver';

  beforeEach(async () => {
    prisma = {
      rolePermissions: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      planPermissions: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [RbacService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(RbacService);
  });

  it('is not a catalogue key, or this suite is testing nothing', () => {
    expect(ALL_PERMISSIONS).not.toContain(RETIRED);
  });

  it('drops retired keys from getPermissionsForRole', async () => {
    prisma.rolePermissions.findUnique.mockResolvedValueOnce({
      role: 'EDITOR_CHEFE',
      permissions: ['artigos.ler', RETIRED],
    });

    const perms = await service.getPermissionsForRole('EDITOR_CHEFE');

    expect(perms).toContain('artigos.ler');
    expect(perms).not.toContain(RETIRED);
  });

  it('drops retired keys from the matrix, so a save round-trips', async () => {
    prisma.rolePermissions.findMany.mockResolvedValueOnce([
      { role: 'EDITOR_CHEFE', permissions: ['artigos.ler', RETIRED] },
    ]);

    const matrix = await service.getMatrix();

    // The exact round trip the screen performs: whatever it was given
    // is what it sends back.
    for (const p of matrix.current.EDITOR_CHEFE) {
      expect(ALL_PERMISSIONS).toContain(p);
    }
  });

  it('never reports more permissions granted than the catalogue holds', async () => {
    prisma.rolePermissions.findMany.mockResolvedValueOnce([
      { role: 'EDITOR_CHEFE', permissions: [...ALL_PERMISSIONS, RETIRED] },
    ]);

    const matrix = await service.getMatrix();

    // Used to read 103% (40/39) on the screen, which is how this was
    // spotted in the first place.
    expect(matrix.counts.EDITOR_CHEFE.granted).toBe(ALL_PERMISSIONS.length);
    expect(matrix.counts.EDITOR_CHEFE.percent).toBe(100);
  });
});
