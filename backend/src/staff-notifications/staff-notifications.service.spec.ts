import { Test } from '@nestjs/testing';
import { StaffNotificationsService } from './staff-notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The two things that must never happen, and one that must:
 *
 *  1. Someone without the area's permission must never receive its
 *     notifications — even if their role happens to have been granted
 *     it by DEFAULT and then explicitly revoked via /admin/permissoes.
 *  2. Someone who switched a category off (staffNotifPrefs[type] ===
 *     false) must never receive it either, regardless of permission.
 *  3. The person who DID the thing must never be told about their own
 *     action, when a call site names them via excludeUserId.
 */
function makePrisma() {
  return {
    rolePermissions: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    staffNotification: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    article: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('StaffNotificationsService', () => {
  let service: StaffNotificationsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        StaffNotificationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(StaffNotificationsService);
  });

  describe('notify()', () => {
    it('reaches every role that DEFAULT-holds the permission, when there is no override', async () => {
      // No RolePermissions rows at all — every role falls back to
      // DEFAULT_ROLE_PERMISSIONS. artigos.aprovar defaults to EDITOR,
      // EDITOR_CHEFE and SUPER_ADMIN.
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'ed1', staffNotifPrefs: {} },
      ]);

      await service.notify({
        type: 'ARTIGO_REVISAO',
        title: 'x',
      });

      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.role.in).toEqual(
        expect.arrayContaining(['SUPER_ADMIN', 'EDITOR_CHEFE', 'EDITOR']),
      );
      expect(where.role.in).not.toContain('COLUNISTA');
      expect(where.role.in).not.toContain('REVISOR');
    });

    it('picks up a role that GAINED the permission via /admin/permissoes', async () => {
      // REVISOR does not hold artigos.aprovar by default — until the
      // newsroom grants it, which is exactly the point of the RBAC
      // override table this reads instead of the shipped constant.
      prisma.rolePermissions.findMany.mockResolvedValueOnce([
        { role: 'REVISOR', permissions: ['artigos.aprovar'] },
      ]);
      prisma.user.findMany.mockResolvedValueOnce([]);

      await service.notify({ type: 'ARTIGO_REVISAO', title: 'x' });

      expect(prisma.user.findMany.mock.calls[0][0].where.role.in).toContain(
        'REVISOR',
      );
    });

    it('drops a role that LOST a default permission via override', async () => {
      prisma.rolePermissions.findMany.mockResolvedValueOnce([
        { role: 'EDITOR', permissions: [] },
      ]);
      prisma.user.findMany.mockResolvedValueOnce([]);

      await service.notify({ type: 'ARTIGO_REVISAO', title: 'x' });

      expect(prisma.user.findMany.mock.calls[0][0].where.role.in).not.toContain(
        'EDITOR',
      );
    });

    it('excludes the person who did the thing, at the query level', async () => {
      await service.notify({
        type: 'PACOTE',
        title: 'x',
        excludeUserId: 'u1',
      });

      expect(prisma.user.findMany.mock.calls[0][0].where.id).toEqual({
        not: 'u1',
      });
    });

    it('does not query for an excluded id when none is given', async () => {
      await service.notify({ type: 'PACOTE', title: 'x' });

      expect(prisma.user.findMany.mock.calls[0][0].where.id).toBeUndefined();
    });

    it('writes no row for someone who opted out of this exact area', async () => {
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'u1', staffNotifPrefs: { PACOTE: false } },
        { id: 'u2', staffNotifPrefs: {} },
      ]);

      await service.notify({ type: 'PACOTE', title: 'x' });

      const rows = prisma.staffNotification.createMany.mock.calls[0][0].data;
      expect(rows.map((r: { recipientId: string }) => r.recipientId)).toEqual([
        'u2',
      ]);
    });

    // The default has to be ON, not off — an account that never opened
    // the preferences screen must not be silently excluded from
    // everything it is entitled to hear about.
    it('treats an absent key as switched on', async () => {
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'u1', staffNotifPrefs: {} },
      ]);

      await service.notify({ type: 'PACOTE', title: 'x' });

      expect(prisma.staffNotification.createMany).toHaveBeenCalled();
    });

    it('writes nothing at all when every candidate opted out', async () => {
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'u1', staffNotifPrefs: { PACOTE: false } },
      ]);

      await service.notify({ type: 'PACOTE', title: 'x' });

      expect(prisma.staffNotification.createMany).not.toHaveBeenCalled();
    });

    it('never throws — a failed write must not take the real action down with it', async () => {
      prisma.user.findMany.mockRejectedValueOnce(new Error('db is down'));

      await expect(
        service.notify({ type: 'PACOTE', title: 'x' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('notifyAuthorPublished()', () => {
    it('writes to the author alone, no permission involved', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ staffNotifPrefs: {} });

      await service.notifyAuthorPublished({ authorId: 'a1', title: 'x' });

      expect(prisma.staffNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recipientId: 'a1',
          type: 'ARTIGO_PUBLICADO',
        }),
      });
    });

    it('respects the author having switched this off', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        staffNotifPrefs: { ARTIGO_PUBLICADO: false },
      });

      await service.notifyAuthorPublished({ authorId: 'a1', title: 'x' });

      expect(prisma.staffNotification.create).not.toHaveBeenCalled();
    });
  });

  describe('enqueueAuthorNotifications() — the publish poller', () => {
    it('claims the article BEFORE writing the notification', async () => {
      prisma.article.findMany.mockResolvedValueOnce([
        { id: 'art1', title: 'T', slug: 't', authorId: 'a1' },
      ]);
      prisma.user.findUnique.mockResolvedValueOnce({ staffNotifPrefs: {} });

      const now = new Date('2026-09-27T10:00:00Z');
      await service.enqueueAuthorNotifications(now);

      expect(prisma.article.updateMany).toHaveBeenCalledWith({
        where: { id: 'art1', authorNotifiedAt: null },
        data: { authorNotifiedAt: now },
      });
      expect(prisma.staffNotification.create).toHaveBeenCalled();
    });

    it('loses the claim race quietly and writes nothing', async () => {
      prisma.article.findMany.mockResolvedValueOnce([
        { id: 'art1', title: 'T', slug: 't', authorId: 'a1' },
      ]);
      prisma.article.updateMany.mockResolvedValueOnce({ count: 0 });

      const sent = await service.enqueueAuthorNotifications();

      expect(sent).toBe(0);
      expect(prisma.staffNotification.create).not.toHaveBeenCalled();
    });

    it('only looks at articles published in the last 24 hours', async () => {
      const now = new Date('2026-09-27T10:00:00Z');
      await service.enqueueAuthorNotifications(now);

      const where = prisma.article.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('PUBLICADO');
      expect(where.authorNotifiedAt).toBeNull();
      expect(where.publishedAt.gte).toEqual(new Date('2026-09-26T10:00:00Z'));
    });
  });

  describe('reading', () => {
    it("markRead only ever touches the caller's own row", async () => {
      await service.markRead('n1', 'u1');

      expect(prisma.staffNotification.updateMany).toHaveBeenCalledWith({
        where: { id: 'n1', recipientId: 'u1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });

    it('list() returns both the page and the unread count', async () => {
      prisma.staffNotification.findMany.mockResolvedValueOnce([{ id: 'n1' }]);
      prisma.staffNotification.count.mockResolvedValueOnce(3);

      const result = await service.list('u1');

      expect(result).toEqual({ items: [{ id: 'n1' }], unread: 3 });
    });
  });
});
