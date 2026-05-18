import { Test } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

function makePrismaMock() {
  return {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let activity: { record: jest.Mock };

  beforeEach(async () => {
    prisma = makePrismaMock();
    activity = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityLogService, useValue: activity },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  describe('invite()', () => {
    it('hashes a random password and creates the user with the chosen role', async () => {
      prisma.user.create.mockResolvedValueOnce({
        id: 'u1',
        email: 'novo@x.pt',
        role: 'JORNALISTA',
      });
      const result = await service.invite(
        { email: 'NOVO@x.pt', name: 'Novo', role: 'JORNALISTA' },
        { id: 'admin', role: 'SUPER_ADMIN' },
      );
      const args = prisma.user.create.mock.calls[0][0];
      expect(args.data.email).toBe('novo@x.pt'); // lowercased
      expect(args.data.role).toBe('JORNALISTA');
      expect(typeof args.data.password).toBe('string');
      expect(args.data.password.length).toBeGreaterThan(20); // bcrypt-ish
      expect(result.temporaryPassword).toBeDefined();
      expect(activity.record).toHaveBeenCalled();
    });
  });

  describe('changeOwnPassword()', () => {
    it('rejects when current password does not match', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        password: await bcrypt.hash('correct', 10),
      });
      await expect(
        service.changeOwnPassword('u1', { current: 'wrong', next: 'newPassword!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('hashes and persists the new password when current matches', async () => {
      const stored = await bcrypt.hash('correct123', 10);
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', password: stored });
      prisma.user.update.mockResolvedValueOnce({ id: 'u1' });
      await service.changeOwnPassword('u1', {
        current: 'correct123',
        next: 'NewPassword!23',
      });
      const args = prisma.user.update.mock.calls[0][0];
      expect(args.where).toEqual({ id: 'u1' });
      const newHash = args.data.password as string;
      expect(await bcrypt.compare('NewPassword!23', newHash)).toBe(true);
    });
  });

  describe('changeRole()', () => {
    it('records an activity entry when role changes', async () => {
      prisma.user.update.mockResolvedValueOnce({
        id: 'u2',
        email: 'a@b.pt',
        role: 'EDITOR',
      });
      await service.changeRole(
        'u2',
        'EDITOR',
        { id: 'admin', role: 'SUPER_ADMIN' },
      );
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'role-changed',
          targetType: 'user',
        }),
      );
    });
  });

  describe('updateOwn()', () => {
    it('does not allow updating role or email through profile endpoint', async () => {
      prisma.user.update.mockResolvedValueOnce({ id: 'u1' });
      await service.updateOwn('u1', {
        bio: 'short bio',
        // @ts-expect-error attempt to inject role
        role: 'SUPER_ADMIN',
      });
      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data.role).toBeUndefined();
      expect(data.email).toBeUndefined();
      expect(data.bio).toBe('short bio');
    });
  });

  describe('list()', () => {
    it('omits password from results', async () => {
      prisma.user.findMany.mockResolvedValueOnce([]);
      prisma.user.count.mockResolvedValueOnce(0);
      await service.list({ page: 1, pageSize: 10 });
      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.select).toEqual(
        expect.objectContaining({ password: false, email: true }),
      );
    });
  });

  // Just to keep the variable used so ForbiddenException import is intentional
  it('has ForbiddenException imported for downstream guards', () => {
    expect(ForbiddenException).toBeDefined();
  });
});
