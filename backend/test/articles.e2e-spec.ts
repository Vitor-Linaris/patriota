import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser, bearer } from './helpers/auth';
import { truncate } from './helpers/db';
import { PrismaService } from '../src/prisma/prisma.service';
import { ArticlesScheduler } from '../src/articles/articles.scheduler';

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
    await truncate(app, ['Article', 'Category']);
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
        path: '/root/', // placeholder — these tests never assert on the tree
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

  it('JORNALISTA POST /publish falls back to submitForReview (no auto-publish)', async () => {
    const author = await makeUser(app, { role: 'JORNALISTA' });
    const created = await request(app.getHttpServer())
      .post('/admin/articles')
      .set(bearer(author))
      .send({ title: 'Artigo do jornalista', categoryId })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(`/admin/articles/${created.body.id}/publish`)
      .set(bearer(author))
      .expect(201);
    expect(res.body.status).toBe('EM_REVISAO');
  });

  it('Full review flow: submit → reject (with reason) → re-submit → approve → public', async () => {
    const author = await makeUser(app, { role: 'JORNALISTA' });
    const chief = await makeUser(app, { role: 'EDITOR_CHEFE' });

    // 1. Author creates draft
    const created = await request(app.getHttpServer())
      .post('/admin/articles')
      .set(bearer(author))
      .send({
        title: 'Investigação sensível',
        summary: 'Resumo',
        content: '<p>Conteúdo</p>',
        categoryId,
      })
      .expect(201);
    const id = created.body.id;
    expect(created.body.status).toBe('RASCUNHO');

    // 2. Author submits for review
    const submitted = await request(app.getHttpServer())
      .post(`/admin/articles/${id}/submit`)
      .set(bearer(author))
      .send({})
      .expect(201);
    expect(submitted.body.status).toBe('EM_REVISAO');

    // 3. Author CANNOT reject (no artigos.aprovar)
    await request(app.getHttpServer())
      .post(`/admin/articles/${id}/reject`)
      .set(bearer(author))
      .send({ reason: 'tentar' })
      .expect(403);

    // 4. Chief rejects with a reason → back to RASCUNHO + rejectionReason
    const rejected = await request(app.getHttpServer())
      .post(`/admin/articles/${id}/reject`)
      .set(bearer(chief))
      .send({ reason: 'Faltam fontes oficiais' })
      .expect(201);
    expect(rejected.body.status).toBe('RASCUNHO');
    expect(rejected.body.rejectionReason).toBe('Faltam fontes oficiais');

    // 5. Author re-submits
    await request(app.getHttpServer())
      .post(`/admin/articles/${id}/submit`)
      .set(bearer(author))
      .send({})
      .expect(201);

    // 6. Chief publishes (from EM_REVISAO)
    const published = await request(app.getHttpServer())
      .post(`/admin/articles/${id}/publish`)
      .set(bearer(chief))
      .expect(201);
    expect(published.body.status).toBe('PUBLICADO');
    expect(published.body.rejectionReason).toBeNull();

    // 7. Public can read it
    await request(app.getHttpServer())
      .get(`/public/articles/by-slug/investigacao-sensivel`)
      .expect(200);
  });

  it('Scheduler promotes AGENDADO articles whose scheduledAt has passed', async () => {
    const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const prisma = app.get(PrismaService);
    const scheduler = app.get(ArticlesScheduler);

    // 1. Editor saves an article as AGENDADO with a past scheduledAt
    //    (simulating "scheduled for 2 minutes ago" — never published)
    const past = new Date(Date.now() - 60_000).toISOString();
    const created = await request(app.getHttpServer())
      .post('/admin/articles')
      .set(bearer(editor))
      .send({
        title: 'Artigo agendado',
        content: '<p>body</p>',
        categoryId,
        status: 'AGENDADO',
        scheduledAt: past,
      })
      .expect(201);
    expect(created.body.status).toBe('AGENDADO');

    // 2. Public can't read it yet
    await request(app.getHttpServer())
      .get('/public/articles/by-slug/artigo-agendado')
      .expect(404);

    // 3. Cron tick promotes it
    const promoted = await scheduler.runDueArticles();
    expect(promoted).toBeGreaterThanOrEqual(1);

    // 4. Now public can read it
    const fetched = await request(app.getHttpServer())
      .get('/public/articles/by-slug/artigo-agendado')
      .expect(200);
    expect(fetched.body.status).toBe('PUBLICADO');
    // publishedAt should reflect the scheduled date, not "now"
    expect(new Date(fetched.body.publishedAt).getTime()).toBe(
      new Date(past).getTime(),
    );

    // 5. Article row no longer has a scheduledAt
    const row = await prisma.article.findUnique({
      where: { id: created.body.id },
    });
    expect(row?.scheduledAt).toBeNull();
  });

  it('Admin list exposes the per-article views counter incremented by public reads', async () => {
    const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const created = await request(app.getHttpServer())
      .post('/admin/articles')
      .set(bearer(editor))
      .send({
        title: 'Mais lido',
        content: '<p>x</p>',
        categoryId,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/admin/articles/${created.body.id}/publish`)
      .set(bearer(editor));

    // Hit the public endpoint 3× — views fire-and-forget, so wait for
    // the increment to settle before re-reading.
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .get('/public/articles/by-slug/mais-lido')
        .expect(200);
    }
    await new Promise((r) => setTimeout(r, 100));

    const adminList = await request(app.getHttpServer())
      .get('/admin/articles?pageSize=10')
      .set(bearer(editor))
      .expect(200);
    const row = (adminList.body.items as { id: string; views: number }[]).find(
      (a) => a.id === created.body.id,
    );
    expect(row).toBeDefined();
    expect(row!.views).toBeGreaterThanOrEqual(3);
  });

  it('Cannot reject articles not in EM_REVISAO', async () => {
    const author = await makeUser(app, { role: 'JORNALISTA' });
    const chief = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const created = await request(app.getHttpServer())
      .post('/admin/articles')
      .set(bearer(author))
      .send({ title: 'Ainda rascunho', categoryId })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/admin/articles/${created.body.id}/reject`)
      .set(bearer(chief))
      .send({ reason: 'qualquer' })
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
        path: '/root/', // placeholder — these tests never assert on the tree
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
