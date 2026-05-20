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
      delete: jest.fn(),
      count: jest.fn(),
    },
    article: {
      count: jest.fn(),
    },
    activityLog: {
      deleteMany: jest.fn(),
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

    it('forbids EDITOR_CHEFE from creating a SUPER_ADMIN', async () => {
      await expect(
        service.invite(
          { email: 'x@y.pt', role: 'SUPER_ADMIN' },
          { id: 'chefe', role: 'EDITOR_CHEFE' },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('allows EDITOR_CHEFE to create another EDITOR_CHEFE (peer level)', async () => {
      prisma.user.create.mockResolvedValueOnce({
        id: 'u2', email: 'peer@x.pt', role: 'EDITOR_CHEFE',
      });
      await expect(
        service.invite(
          { email: 'peer@x.pt', role: 'EDITOR_CHEFE' },
          { id: 'chefe', role: 'EDITOR_CHEFE' },
        ),
      ).resolves.toBeDefined();
    });

    it('forbids EDITOR from creating an EDITOR (only JORNALISTA)', async () => {
      await expect(
        service.invite(
          { email: 'x@y.pt', role: 'EDITOR' },
          { id: 'ed', role: 'EDITOR' },
        ),
      ).rejects.toThrow(ForbiddenException);
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
      // findUnique now precedes update for the hierarchy check.
      prisma.user.findUnique.mockResolvedValueOnce({
        role: 'JORNALISTA', email: 'a@b.pt',
      });
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

    it('forbids EDITOR_CHEFE from demoting a SUPER_ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        role: 'SUPER_ADMIN', email: 'admin@x.pt',
      });
      await expect(
        service.changeRole(
          'super',
          'EDITOR',
          { id: 'chefe', role: 'EDITOR_CHEFE' },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('forbids EDITOR_CHEFE from changing a peer EDITOR_CHEFE', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        role: 'EDITOR_CHEFE', email: 'peer@x.pt',
      });
      await expect(
        service.changeRole(
          'peer-id',
          'EDITOR',
          { id: 'self-id', role: 'EDITOR_CHEFE' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids assigning a role outside the actor allow-list', async () => {
      await expect(
        service.changeRole(
          'u2',
          'SUPER_ADMIN',
          { id: 'chefe', role: 'EDITOR_CHEFE' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('resetPassword()', () => {
    it('refuses to reset your own password (use /users/me/password instead)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'self', email: 's@x.pt', role: 'SUPER_ADMIN',
      });
      await expect(
        service.resetPassword('self', { id: 'self', role: 'SUPER_ADMIN' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids EDITOR_CHEFE from resetting a SUPER_ADMIN password', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'admin', email: 'admin@x.pt', role: 'SUPER_ADMIN',
      });
      await expect(
        service.resetPassword('admin', { id: 'chefe', role: 'EDITOR_CHEFE' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rotates the bcrypt hash, logs the action and returns the new temp password', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', email: 'u@x.pt', role: 'JORNALISTA',
      });
      prisma.user.update.mockResolvedValueOnce({});
      const res = await service.resetPassword('u1', {
        id: 'admin',
        role: 'SUPER_ADMIN',
      });
      expect(res.temporaryPassword.length).toBeGreaterThan(8);
      const args = prisma.user.update.mock.calls[0][0];
      expect(typeof args.data.password).toBe('string');
      expect(args.data.password.startsWith('$2')).toBe(true); // bcrypt hash
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'password-reset' }),
      );
    });
  });

  describe('remove()', () => {
    it('refuses self-deletion', async () => {
      await expect(
        service.remove('me', { id: 'me', role: 'SUPER_ADMIN' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids EDITOR_CHEFE from deleting a SUPER_ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'admin', email: 'admin@x.pt', role: 'SUPER_ADMIN',
      });
      await expect(
        service.remove('admin', { id: 'chefe', role: 'EDITOR_CHEFE' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks delete when the user still owns articles', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', email: 'u@x.pt', role: 'JORNALISTA',
      });
      prisma.article.count.mockResolvedValueOnce(3);
      await expect(
        service.remove('u1', { id: 'admin', role: 'SUPER_ADMIN' }),
      ).rejects.toThrow(/3 artigos? associados/i);
    });

    it('deletes when nothing blocks it and logs the action', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1', email: 'u@x.pt', role: 'JORNALISTA',
      });
      prisma.article.count.mockResolvedValueOnce(0);
      prisma.activityLog.deleteMany.mockResolvedValueOnce({ count: 2 });
      prisma.user.delete.mockResolvedValueOnce({});
      const res = await service.remove('u1', {
        id: 'admin', role: 'SUPER_ADMIN',
      });
      expect(res.ok).toBe(true);
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'deleted', targetType: 'user' }),
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

});
