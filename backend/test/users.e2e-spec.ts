import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser, bearer } from './helpers/auth';
import { truncate } from './helpers/db';

describe('Users (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Cascade-truncate all user-owned data so each test starts fresh.
    await truncate(app, [
      'ActivityLog',
      'Article',
      'User',
      'Subtopic',
      'Category',
    ]);
  });

  it('GET /admin/users requires utilizadores.ver', async () => {
    const jorn = await makeUser(app, { role: 'JORNALISTA' });
    await request(app.getHttpServer())
      .get('/admin/users')
      .set(bearer(jorn))
      .expect(403);
  });

  it('admin invites → temp password returned → list contains new user', async () => {
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    const invited = await request(app.getHttpServer())
      .post('/admin/users')
      .set(bearer(admin))
      .send({
        email: 'invited@e2e.test',
        name: 'Convidada',
        role: 'JORNALISTA',
      })
      .expect(201);
    expect(invited.body.temporaryPassword).toBeDefined();
    expect(invited.body.password).toBeUndefined();

    const list = await request(app.getHttpServer())
      .get('/admin/users')
      .set(bearer(admin))
      .expect(200);
    const emails = (list.body.items as { email: string }[]).map((u) => u.email);
    expect(emails).toContain('invited@e2e.test');
  });

  it('PATCH /users/me updates bio/phone but not role', async () => {
    const user = await makeUser(app, { role: 'EDITOR' });
    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set(bearer(user))
      .send({ bio: 'Sou editor.', phone: '+351 912 000 000', role: 'SUPER_ADMIN' })
      .expect(400); // ValidationPipe rejects unknown `role` property
    void res;
  });

  it('PATCH /users/me succeeds with allowed fields only', async () => {
    const user = await makeUser(app, { role: 'EDITOR' });
    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set(bearer(user))
      .send({ bio: 'Sou editor.', phone: '+351 912 000 000' })
      .expect(200);
    expect(res.body.bio).toBe('Sou editor.');
    expect(res.body.role).toBe('EDITOR');
  });

  it('POST /users/me/password rejects wrong current password', async () => {
    const user = await makeUser(app, { role: 'EDITOR', password: 'CorrectPass1' });
    await request(app.getHttpServer())
      .post('/users/me/password')
      .set(bearer(user))
      .send({ current: 'WrongPass1', next: 'NewSecret999' })
      .expect(401);
  });

  it('PATCH /admin/users/:id/role with permission updates role', async () => {
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    const target = await makeUser(app, { role: 'JORNALISTA' });
    const res = await request(app.getHttpServer())
      .patch(`/admin/users/${target.id}/role`)
      .set(bearer(admin))
      .send({ role: 'EDITOR' })
      .expect(200);
    expect(res.body.role).toBe('EDITOR');
  });

  it('EDITOR_CHEFE cannot invite a SUPER_ADMIN', async () => {
    const chefe = await makeUser(app, { role: 'EDITOR_CHEFE' });
    await request(app.getHttpServer())
      .post('/admin/users')
      .set(bearer(chefe))
      .send({ email: 'pwn@x.pt', role: 'SUPER_ADMIN' })
      .expect(403);
  });

  it('EDITOR_CHEFE cannot demote a SUPER_ADMIN', async () => {
    const chefe = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    await request(app.getHttpServer())
      .patch(`/admin/users/${admin.id}/role`)
      .set(bearer(chefe))
      .send({ role: 'JORNALISTA' })
      .expect(403);
  });

  it('EDITOR_CHEFE can invite another EDITOR_CHEFE (peer level)', async () => {
    const chefe = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const res = await request(app.getHttpServer())
      .post('/admin/users')
      .set(bearer(chefe))
      .send({ email: 'peer@x.pt', role: 'EDITOR_CHEFE' })
      .expect(201);
    expect(res.body.role).toBe('EDITOR_CHEFE');
  });

  it('POST /admin/users/:id/reset-password returns a new temp password', async () => {
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    const target = await makeUser(app, { role: 'JORNALISTA' });
    const res = await request(app.getHttpServer())
      .post(`/admin/users/${target.id}/reset-password`)
      .set(bearer(admin))
      .expect(201);
    expect(res.body.temporaryPassword).toMatch(/^\S{8,}$/);
    expect(res.body.email).toBe(target.email);
  });

  it('EDITOR_CHEFE cannot reset a SUPER_ADMIN password', async () => {
    const chefe = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    await request(app.getHttpServer())
      .post(`/admin/users/${admin.id}/reset-password`)
      .set(bearer(chefe))
      .expect(403);
  });

  it('JORNALISTA cannot reset anyone (lacks utilizadores.resetar_password)', async () => {
    const j = await makeUser(app, { role: 'JORNALISTA' });
    const other = await makeUser(app, { role: 'JORNALISTA' });
    await request(app.getHttpServer())
      .post(`/admin/users/${other.id}/reset-password`)
      .set(bearer(j))
      .expect(403);
  });

  it('DELETE /admin/users/:id removes a user without content', async () => {
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    const target = await makeUser(app, { role: 'JORNALISTA' });
    await request(app.getHttpServer())
      .delete(`/admin/users/${target.id}`)
      .set(bearer(admin))
      .expect(200);
    const list = await request(app.getHttpServer())
      .get('/admin/users')
      .set(bearer(admin));
    const ids = (list.body.items as { id: string }[]).map((u) => u.id);
    expect(ids).not.toContain(target.id);
  });

  it('DELETE refuses self-deletion', async () => {
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    await request(app.getHttpServer())
      .delete(`/admin/users/${admin.id}`)
      .set(bearer(admin))
      .expect(403);
  });

  it('EDITOR_CHEFE cannot delete a SUPER_ADMIN', async () => {
    const chefe = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    await request(app.getHttpServer())
      .delete(`/admin/users/${admin.id}`)
      .set(bearer(chefe))
      .expect(403);
  });

  it('GET /auth/me exposes assignableRoles for the current user', async () => {
    const chefe = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set(bearer(chefe))
      .expect(200);
    expect(res.body.assignableRoles).toEqual(
      expect.arrayContaining([
        'EDITOR_CHEFE', 'EDITOR', 'JORNALISTA', 'REVISOR', 'MODERADOR', 'ANALISTA',
      ]),
    );
    expect(res.body.assignableRoles).not.toContain('SUPER_ADMIN');
  });
});
