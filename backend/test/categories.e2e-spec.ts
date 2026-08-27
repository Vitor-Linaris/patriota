import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser, bearer } from './helpers/auth';
import { truncate } from './helpers/db';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Categories (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncate(app, ['Article', 'Category', 'User']);
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

    // The subtopic is now a real depth-1 Category child (parentId is
    // onDelete: Restrict), so the parent refuses to delete while it
    // exists — the same protection remove() gives a category with
    // articles, extended to children.
    await request(app.getHttpServer())
      .delete(`/admin/categories/${created.body.id}`)
      .set(bearer(admin))
      .expect(409);

    // Removing the child first clears the way.
    await request(app.getHttpServer())
      .delete(`/admin/categories/${created.body.id}/subtopics/${sub.body.id}`)
      .set(bearer(admin))
      .expect(200);

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

  it('refuses to delete a category with articles, with 409 not 500', async () => {
    // Against the real database, which is where this mattered:
    // Article.category has no onDelete, so Postgres raises a
    // foreign-key violation. Before this guard it escaped as a 500.
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    const prisma = app.get(PrismaService);

    const created = await request(app.getHttpServer())
      .post('/admin/categories')
      .set(bearer(admin))
      .send({ name: 'Com artigos', description: '', icon: '◆', color: '#000000' })
      .expect(201);

    await prisma.article.create({
      data: {
        slug: 'artigo-a-bloquear',
        title: 'Artigo a bloquear',
        summary: 's',
        content: 'c',
        status: 'PUBLICADO',
        publishedAt: new Date(),
        categoryId: created.body.id,
        authorId: admin.id,
      },
    });

    const res = await request(app.getHttpServer())
      .delete(`/admin/categories/${created.body.id}`)
      .set(bearer(admin))
      .expect(409);

    // The editor is told what is in the way, not just refused.
    expect(res.body.message).toMatch(/Com artigos/);
    expect(res.body.message).toMatch(/1 artigo associado/);

    // And the category is still there.
    expect(
      await prisma.category.findUnique({ where: { id: created.body.id } }),
    ).not.toBeNull();
  });
});
