import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser, bearer, type TestUser } from './helpers/auth';
import { makeReader, readerBearer } from './helpers/reader';
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

  describe('subscriptions given by hand', () => {
    const grant = (
      readerId: string,
      actor: TestUser,
      body: { until?: string; note?: string } = {},
    ) =>
      request(app.getHttpServer())
        .post(`/admin/readers/${readerId}/subscription`)
        .set(bearer(actor))
        .send(body);

    it('a MODERADOR cannot give a subscription away', async () => {
      // Moderating a thread and giving away money are different
      // decisions, so they are different permissions.
      const reader = await makeReader(app);
      const moderator = await makeUser(app, { role: 'MODERADOR' });
      await grant(reader.id, moderator).expect(403);
    });

    it('a SUPER_ADMIN can, with an end date and a reason', async () => {
      const reader = await makeReader(app);
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      const until = new Date(Date.now() + 30 * DAY);

      const res = await grant(reader.id, admin, {
        until: until.toISOString(),
        note: 'Colunista convidado.',
      }).expect(200);

      expect(res.body.plan).toBe('PREMIUM');
      expect(res.body.planSource).toBe('MANUAL');
      expect(res.body.planActive).toBe(true);
      expect(res.body.planNote).toBe('Colunista convidado.');
      expect(res.body.planGrantedBy.id).toBe(admin.id);
    });

    it('accepts a subscription with no end date, but only if asked', async () => {
      const reader = await makeReader(app);
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });

      const res = await grant(reader.id, admin, {}).expect(200);
      expect(res.body.planRenewsAt).toBeNull();
      expect(res.body.planActive).toBe(true);
    });

    it('refuses a date in the past', async () => {
      // It would lapse on the way out of the endpoint, leaving an admin
      // looking at a reader who is somehow still free.
      const reader = await makeReader(app);
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      await grant(reader.id, admin, {
        until: new Date(Date.now() - DAY).toISOString(),
      }).expect(400);
    });

    it('the gift expires on its own, with nothing scheduled', async () => {
      // Same claim as the bans, and the one that makes a dated grant
      // worth anything: backdating the row is all that happens between
      // being a subscriber and not being one.
      const reader = await makeReader(app);
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      await grant(reader.id, admin, {
        until: new Date(Date.now() + DAY).toISOString(),
      }).expect(200);

      await prisma.reader.update({
        where: { id: reader.id },
        data: { planRenewsAt: new Date(Date.now() - DAY) },
      });

      const res = await request(app.getHttpServer())
        .get(`/admin/readers?q=${encodeURIComponent(reader.email)}`)
        .set(bearer(admin))
        .expect(200);
      expect(res.body.items[0].plan).toBe('PREMIUM');
      expect(res.body.items[0].planActive).toBe(false);
    });

    it('a lapsed subscription is tidied away on the next request', async () => {
      const reader = await makeReader(app);
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      await grant(reader.id, admin, {
        until: new Date(Date.now() + DAY).toISOString(),
      }).expect(200);
      await prisma.reader.update({
        where: { id: reader.id },
        data: { planRenewsAt: new Date(Date.now() - DAY) },
      });

      await request(app.getHttpServer())
        .get('/reader/me')
        .set(readerBearer(reader))
        .expect(200);

      // Fire and forget in the guard, so give it a moment to land.
      await new Promise((r) => setTimeout(r, 250));
      const row = await prisma.reader.findUnique({ where: { id: reader.id } });
      expect(row!.plan).toBe('GRATIS');
      expect(row!.planSource).toBeNull();
    });

    it('takes a gift back', async () => {
      const reader = await makeReader(app);
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      await grant(reader.id, admin, {}).expect(200);

      const res = await request(app.getHttpServer())
        .delete(`/admin/readers/${reader.id}/subscription`)
        .set(bearer(admin))
        .expect(200);
      expect(res.body.plan).toBe('GRATIS');
      expect(res.body.planActive).toBe(false);
    });

    it('will not write a gift over a paid subscription', async () => {
      // Two sources disagreeing about when a subscription ends, with the
      // reader still being charged. Cancelling the payment is a decision
      // for a person, not a side effect of this endpoint.
      const reader = await makeReader(app);
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      await prisma.reader.update({
        where: { id: reader.id },
        data: {
          plan: 'PREMIUM',
          planSource: 'STRIPE',
          stripeCustomerId: `cus_${reader.id}`,
        },
      });

      await grant(reader.id, admin, {}).expect(409);
      await request(app.getHttpServer())
        .delete(`/admin/readers/${reader.id}/subscription`)
        .set(bearer(admin))
        .expect(409);
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
