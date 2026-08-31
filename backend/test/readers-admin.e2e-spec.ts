import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser, bearer } from './helpers/auth';
import { makeReader } from './helpers/reader';
import { truncate } from './helpers/db';
import { PrismaService } from '../src/prisma/prisma.service';

const DAY = 24 * 60 * 60 * 1000;

describe('Readers admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.FEATURE_READER_AREA = 'true';
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await truncate(app, ['Comment', 'Reader', 'Article', 'Category', 'User']);
    await app.close();
  });

  beforeEach(async () => {
    await truncate(app, ['Comment', 'Reader', 'Article', 'Category', 'User']);
  });

  describe('listing', () => {
    it('a JORNALISTA cannot see the reader list', async () => {
      const journalist = await makeUser(app, { role: 'JORNALISTA' });
      await request(app.getHttpServer())
        .get('/admin/readers')
        .set(bearer(journalist))
        .expect(403);
    });

    it('never carries the password, the unsubscribe secret or the Stripe id', async () => {
      // The article payload taught this the hard way: an `include`
      // returns every scalar, and a reader row holds three things that
      // have no business on an admin screen.
      await makeReader(app, { name: 'Maria' });
      const moderator = await makeUser(app, { role: 'MODERADOR' });

      const res = await request(app.getHttpServer())
        .get('/admin/readers')
        .set(bearer(moderator))
        .expect(200);

      const keys = Object.keys(res.body.items[0]);
      for (const forbidden of [
        'password',
        'unsubscribeToken',
        'stripeCustomerId',
      ]) {
        expect(keys).not.toContain(forbidden);
      }
    });

    it('searches by name and by e-mail', async () => {
      await makeReader(app, { name: 'Ana Silva', email: 'ana@test.local' });
      await makeReader(app, { name: 'Bruno Costa', email: 'bruno@test.local' });
      const moderator = await makeUser(app, { role: 'MODERADOR' });

      const byName = await request(app.getHttpServer())
        .get('/admin/readers?q=silva')
        .set(bearer(moderator))
        .expect(200);
      expect(byName.body.total).toBe(1);

      const byEmail = await request(app.getHttpServer())
        .get('/admin/readers?q=bruno@')
        .set(bearer(moderator))
        .expect(200);
      expect(byEmail.body.total).toBe(1);
    });

    it('filters by plan', async () => {
      const paying = await makeReader(app);
      await makeReader(app);
      await prisma.reader.update({
        where: { id: paying.id },
        data: { plan: 'PREMIUM' },
      });
      const moderator = await makeUser(app, { role: 'MODERADOR' });

      const res = await request(app.getHttpServer())
        .get('/admin/readers?plan=PREMIUM')
        .set(bearer(moderator))
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].id).toBe(paying.id);
    });

    it('"suspended" asks the date, not the status', async () => {
      // The distinction the whole ban design turns on: a row can still
      // say SUSPENSO with an end date from last week. Filtering on the
      // status would list somebody who is free to comment.
      const live = await makeReader(app);
      const served = await makeReader(app);
      await prisma.reader.update({
        where: { id: live.id },
        data: { status: 'SUSPENSO', suspendedUntil: new Date(Date.now() + DAY) },
      });
      await prisma.reader.update({
        where: { id: served.id },
        data: { status: 'SUSPENSO', suspendedUntil: new Date(Date.now() - DAY) },
      });
      const moderator = await makeUser(app, { role: 'MODERADOR' });

      const byStatus = await request(app.getHttpServer())
        .get('/admin/readers?status=SUSPENSO')
        .set(bearer(moderator))
        .expect(200);
      expect(byStatus.body.total).toBe(2);

      const reallyBanned = await request(app.getHttpServer())
        .get('/admin/readers?suspended=true')
        .set(bearer(moderator))
        .expect(200);
      expect(reallyBanned.body.total).toBe(1);
      expect(reallyBanned.body.items[0].id).toBe(live.id);
      expect(reallyBanned.body.items[0].suspended).toBe(true);
    });

    it('counts the whole table, not the page', async () => {
      const paying = await makeReader(app);
      await makeReader(app);
      await makeReader(app, { verified: false, status: 'PENDENTE_VERIFICACAO' });
      await prisma.reader.update({
        where: { id: paying.id },
        data: { plan: 'PREMIUM' },
      });
      const moderator = await makeUser(app, { role: 'MODERADOR' });

      const res = await request(app.getHttpServer())
        .get('/admin/readers/stats')
        .set(bearer(moderator))
        .expect(200);

      expect(res.body.total).toBe(3);
      expect(res.body.plan.PREMIUM).toBe(1);
      expect(res.body.plan.GRATIS).toBe(2);
      expect(res.body.status.PENDENTE_VERIFICACAO).toBe(1);
      expect(res.body.bannedNow).toBe(0);
    });
  });

  describe('plan permissions', () => {
    it('ships GRATIS and PREMIUM alongside the roles', async () => {
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      const res = await request(app.getHttpServer())
        .get('/admin/rbac/matrix')
        .set(bearer(admin))
        .expect(200);

      expect(res.body.plans.keys.map((p: { key: string }) => p.key)).toEqual([
        'GRATIS',
        'PREMIUM',
      ]);
      // GRATIS describes what a free reader could already do, so the one
      // thing a subscription adds is the exclusives.
      expect(res.body.plans.current.GRATIS).not.toContain(
        'assinantes.ler_exclusivos',
      );
      expect(res.body.plans.current.PREMIUM).toContain(
        'assinantes.ler_exclusivos',
      );
    });

    it('keeps the two catalogues apart', async () => {
      // This is the reason plans are a separate table and a separate
      // endpoint. Cross-contamination either way would mean a permission
      // reading as granted to a population it was never meant for.
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });

      await request(app.getHttpServer())
        .put('/admin/rbac/plan/PREMIUM')
        .set(bearer(admin))
        .send({ permissions: ['artigos.publicar'] })
        .expect(400);

      await request(app.getHttpServer())
        .put('/admin/rbac/role/MODERADOR')
        .set(bearer(admin))
        .send({ permissions: ['assinantes.ler_exclusivos'] })
        .expect(400);
    });

    it('only SUPER_ADMIN may change what a subscription buys', async () => {
      const chief = await makeUser(app, { role: 'EDITOR_CHEFE' });
      await request(app.getHttpServer())
        .put('/admin/rbac/plan/GRATIS')
        .set(bearer(chief))
        .send({ permissions: [] })
        .expect(403);
    });

    it('saves an edit and reads it back', async () => {
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      const before = await prisma.planPermissions.findUnique({
        where: { plan: 'GRATIS' },
      });

      await request(app.getHttpServer())
        .put('/admin/rbac/plan/GRATIS')
        .set(bearer(admin))
        .send({ permissions: ['assinantes.comentar'] })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/admin/rbac/matrix')
        .set(bearer(admin))
        .expect(200);
      expect(res.body.plans.current.GRATIS).toEqual(['assinantes.comentar']);

      // Put it back by hand. PlanPermissions is configuration, not test
      // data, so it is deliberately NOT in the truncate list — which
      // means a test that writes to it owns cleaning up after itself, or
      // the next test to read the matrix inherits this one's edit.
      await prisma.planPermissions.update({
        where: { plan: 'GRATIS' },
        data: { permissions: before!.permissions },
      });
    });

    it('rejects a plan that does not exist', async () => {
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      await request(app.getHttpServer())
        .put('/admin/rbac/plan/OURO')
        .set(bearer(admin))
        .send({ permissions: [] })
        .expect(400);
    });
  });
});
