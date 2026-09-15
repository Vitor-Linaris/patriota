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

/**
 * The boot hook used to re-assert DEFAULT_ROLE_PERMISSIONS as a floor on
 * every start. A default key missing from an existing row is exactly what
 * a revocation looks like — the schema stores only the positive grant
 * list — so every restart silently undid a SUPER_ADMIN's decision.
 */
describe('RbacService — onModuleInit does not undo revocations', () => {
  let service: RbacService;
  let prisma: {
    rolePermissions: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    planPermissions: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      rolePermissions: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      planPermissions: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [RbacService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(RbacService);
  });

  it('leaves an existing row untouched, even when default keys are absent', async () => {
    // An EDITOR_CHEFE row with two permissions deliberately revoked.
    prisma.rolePermissions.findUnique.mockResolvedValue({
      role: 'EDITOR_CHEFE',
      permissions: ALL_PERMISSIONS.filter(
        (p) =>
          p !== 'leitores.oferecer_assinatura' &&
          p !== 'utilizadores.atribuir_roles',
      ),
    });
    prisma.planPermissions.findUnique.mockResolvedValue({
      plan: 'GRATIS',
      permissions: [],
    });

    await service.onModuleInit();

    // The whole point: no write of any kind to a row that already exists.
    expect(prisma.rolePermissions.update).not.toHaveBeenCalled();
    expect(prisma.planPermissions.update).not.toHaveBeenCalled();
    expect(prisma.rolePermissions.create).not.toHaveBeenCalled();
    expect(prisma.planPermissions.create).not.toHaveBeenCalled();
  });

  it('still seeds a row that does not exist yet', async () => {
    // The behaviour that makes a fresh database usable must survive.
    prisma.rolePermissions.findUnique.mockResolvedValue(null);
    prisma.planPermissions.findUnique.mockResolvedValue(null);

    await service.onModuleInit();

    expect(prisma.rolePermissions.create).toHaveBeenCalled();
    expect(prisma.planPermissions.create).toHaveBeenCalled();
    const seeded = prisma.rolePermissions.create.mock.calls.map(
      (c) => c[0].data.role,
    );
    expect(seeded).toContain('EDITOR_CHEFE');
    expect(seeded).toContain('JORNALISTA');
  });
});
