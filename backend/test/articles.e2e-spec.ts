import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser, bearer } from './helpers/auth';
import { truncate } from './helpers/db';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Articles (e2e)', () => {
  let app: INestApplication;
  let categoryId = '';

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncate(app, ['Article', 'Subtopic', 'Category']);
    const prisma = app.get(PrismaService);
    const cat = await prisma.category.create({
      data: {
        slug: 'politica',
        name: 'Política',
        description: 'd',
        icon: '◆',
        color: '#1e40af',
        order: 1,
        visible: true,
      },
    });
    categoryId = cat.id;
  });

  it('POST /admin/articles rejects without auth', async () => {
    await request(app.getHttpServer())
      .post('/admin/articles')
      .send({ title: 'Artigo do jornalista', categoryId })
      .expect(401);
  });

  it('Editor creates → publishes → article visible publicly', async () => {
    const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const created = await request(app.getHttpServer())
      .post('/admin/articles')
      .set(bearer(editor))
      .send({
        title: 'Governo aprova novo orçamento',
        summary: 'Detalhes...',
        content: '<p>Corpo</p>',
        categoryId,
      })
      .expect(201);
    expect(created.body.slug).toBe('governo-aprova-novo-orcamento');
    expect(created.body.status).toBe('RASCUNHO');

    // Public should NOT see it yet
    await request(app.getHttpServer())
      .get('/public/articles/by-slug/governo-aprova-novo-orcamento')
      .expect(404);

    // Publish
    const pub = await request(app.getHttpServer())
      .post(`/admin/articles/${created.body.id}/publish`)
      .set(bearer(editor))
      .expect(201);
    expect(pub.body.status).toBe('PUBLICADO');

    // Public should now find it
    const fetched = await request(app.getHttpServer())
      .get('/public/articles/by-slug/governo-aprova-novo-orcamento')
      .expect(200);
    expect(fetched.body.title).toBe('Governo aprova novo orçamento');
  });

  it('JORNALISTA can only edit own articles (editar_proprios)', async () => {
    const author = await makeUser(app, { role: 'JORNALISTA' });
    const other = await makeUser(app, { role: 'JORNALISTA' });

    const created = await request(app.getHttpServer())
      .post('/admin/articles')
      .set(bearer(author))
      .send({ title: 'Meu artigo', categoryId })
      .expect(201);

    // Author can edit own
    await request(app.getHttpServer())
      .patch(`/admin/articles/${created.body.id}`)
      .set(bearer(author))
      .send({ title: 'Meu artigo editado' })
      .expect(200);

    // Other journalist cannot edit
    await request(app.getHttpServer())
      .patch(`/admin/articles/${created.body.id}`)
      .set(bearer(other))
      .send({ title: 'Sabotage' })
      .expect(403);
  });

  it('JORNALISTA cannot publish (lacks artigos.publicar)', async () => {
    const author = await makeUser(app, { role: 'JORNALISTA' });
    const created = await request(app.getHttpServer())
      .post('/admin/articles')
      .set(bearer(author))
      .send({ title: 'Artigo do jornalista', categoryId })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/admin/articles/${created.body.id}/publish`)
      .set(bearer(author))
      .expect(403);
  });

  it('GET /public/homepage returns featured + side + latest bundle', async () => {
    const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
    for (let i = 0; i < 5; i++) {
      const a = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(editor))
        .send({ title: `Article ${i}`, categoryId, content: '<p>x</p>' });
      await request(app.getHttpServer())
        .post(`/admin/articles/${a.body.id}/publish`)
        .set(bearer(editor));
    }
    const res = await request(app.getHttpServer())
      .get('/public/homepage')
      .expect(200);
    expect(res.body.featured).toBeTruthy();
    expect(Array.isArray(res.body.side)).toBe(true);
    expect(Array.isArray(res.body.latest)).toBe(true);
  });

  it('GET /public/articles?sort=views orders by views desc', async () => {
    const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const prisma = app.get(PrismaService);

    const titles = ['Less viewed', 'Most viewed', 'Mid viewed'];
    const ids: string[] = [];
    for (const title of titles) {
      const created = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(editor))
        .send({ title, categoryId });
      await request(app.getHttpServer())
        .post(`/admin/articles/${created.body.id}/publish`)
        .set(bearer(editor));
      ids.push(created.body.id);
    }
    await prisma.article.update({ where: { id: ids[0] }, data: { views: 1 } });
    await prisma.article.update({ where: { id: ids[1] }, data: { views: 99 } });
    await prisma.article.update({ where: { id: ids[2] }, data: { views: 42 } });

    const res = await request(app.getHttpServer())
      .get('/public/articles?sort=views')
      .expect(200);
    const order = (res.body.items as { title: string }[]).map((a) => a.title);
    expect(order).toEqual(['Most viewed', 'Mid viewed', 'Less viewed']);
  });

  it('GET /public/articles/related/:slug returns same-category siblings only', async () => {
    const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const prisma = app.get(PrismaService);
    const other = await prisma.category.create({
      data: {
        slug: 'desporto',
        name: 'Desporto',
        description: 'd',
        icon: '●',
        color: '#059669',
        order: 2,
        visible: true,
      },
    });

    const ref = await request(app.getHttpServer())
      .post('/admin/articles')
      .set(bearer(editor))
      .send({ title: 'Artigo de referencia', categoryId });
    await request(app.getHttpServer())
      .post(`/admin/articles/${ref.body.id}/publish`)
      .set(bearer(editor));

    for (let i = 0; i < 3; i++) {
      const a = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(editor))
        .send({ title: `Mesmo tema ${i}`, categoryId });
      await request(app.getHttpServer())
        .post(`/admin/articles/${a.body.id}/publish`)
        .set(bearer(editor));
    }
    const off = await request(app.getHttpServer())
      .post('/admin/articles')
      .set(bearer(editor))
      .send({ title: 'Outro tema', categoryId: other.id });
    await request(app.getHttpServer())
      .post(`/admin/articles/${off.body.id}/publish`)
      .set(bearer(editor));

    const res = await request(app.getHttpServer())
      .get('/public/articles/related/artigo-de-referencia?limit=4')
      .expect(200);
    const items = res.body as { id: string; title: string }[];
    expect(items).toHaveLength(3);
    expect(items.find((a) => a.id === ref.body.id)).toBeUndefined();
    expect(items.every((a) => a.title.startsWith('Mesmo tema'))).toBe(true);
  });

  it('GET /public/articles/related/:slug returns [] for missing slug', async () => {
    const res = await request(app.getHttpServer())
      .get('/public/articles/related/inexistente')
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('GET /public/articles only lists PUBLICADO', async () => {
    const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const draft = await request(app.getHttpServer())
      .post('/admin/articles')
      .set(bearer(editor))
      .send({ title: 'Draft', categoryId });
    const published = await request(app.getHttpServer())
      .post('/admin/articles')
      .set(bearer(editor))
      .send({ title: 'Published', categoryId });
    await request(app.getHttpServer())
      .post(`/admin/articles/${published.body.id}/publish`)
      .set(bearer(editor));

    const res = await request(app.getHttpServer())
      .get('/public/articles')
      .expect(200);
    expect(res.body.total).toBe(1);
    const titles = (res.body.items as { title: string }[]).map((a) => a.title);
    expect(titles).toContain('Published');
    expect(titles).not.toContain('Draft');
    void draft;
  });
});
