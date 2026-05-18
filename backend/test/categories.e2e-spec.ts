import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser, bearer } from './helpers/auth';
import { truncate } from './helpers/db';

describe('Categories (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncate(app, ['Subtopic', 'Category']);
  });

  it('rejects POST /admin/categories without authentication', async () => {
    await request(app.getHttpServer())
      .post('/admin/categories')
      .send({
        name: 'X',
        description: 'd',
        icon: '◆',
        color: '#000',
      })
      .expect(401);
  });

  it('admin can create, update, list and delete categories', async () => {
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });

    // Create
    const created = await request(app.getHttpServer())
      .post('/admin/categories')
      .set(bearer(admin))
      .send({
        name: 'Política',
        description: 'Cobertura política',
        icon: '◆',
        color: '#1e40af',
      })
      .expect(201);
    expect(created.body.slug).toBe('politica');

    // List
    const list = await request(app.getHttpServer())
      .get('/admin/categories')
      .set(bearer(admin))
      .expect(200);
    expect(list.body).toHaveLength(1);

    // Update
    await request(app.getHttpServer())
      .patch(`/admin/categories/${created.body.id}`)
      .set(bearer(admin))
      .send({ description: 'Atualizada' })
      .expect(200);

    // Add subtopic
    const sub = await request(app.getHttpServer())
      .post(`/admin/categories/${created.body.id}/subtopics`)
      .set(bearer(admin))
      .send({ label: 'Parlamento' })
      .expect(201);
    expect(sub.body.label).toBe('Parlamento');

    // Public list should include it
    const pub = await request(app.getHttpServer())
      .get('/public/categories')
      .expect(200);
    expect(pub.body[0].subtopics).toHaveLength(1);

    // Delete
    await request(app.getHttpServer())
      .delete(`/admin/categories/${created.body.id}`)
      .set(bearer(admin))
      .expect(200);
  });

  it('public /public/categories does not require authentication', async () => {
    await request(app.getHttpServer()).get('/public/categories').expect(200);
  });

  it('rejects duplicate slugs with 409', async () => {
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    const body = {
      name: 'Cultura',
      slug: 'cultura',
      description: '',
      icon: '◆',
      color: '#000000',
    };
    await request(app.getHttpServer())
      .post('/admin/categories')
      .set(bearer(admin))
      .send(body)
      .expect(201);
    await request(app.getHttpServer())
      .post('/admin/categories')
      .set(bearer(admin))
      .send(body)
      .expect(409);
  });

  it('roles without categorias.eliminar cannot delete', async () => {
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    const jorn = await makeUser(app, { role: 'JORNALISTA' });

    const created = await request(app.getHttpServer())
      .post('/admin/categories')
      .set(bearer(admin))
      .send({ name: 'Test', description: '', icon: '◆', color: '#000000' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/admin/categories/${created.body.id}`)
      .set(bearer(jorn))
      .expect(403);
  });
});
