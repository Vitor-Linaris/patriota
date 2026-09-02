import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser, bearer, type TestUser } from './helpers/auth';
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

  /**
   * The funnel, end to end against the real database and a real Redis
   * cache. Categories are created through the ADMIN API rather than
   * Prisma directly, because that is what invalidates the cached tree —
   * seeding rows behind the service's back would leave resolveSubtreeIds
   * reading a tree that predates them.
   */
  describe('subtree funnel', () => {
    const newCategory = (
      admin: { token: string },
      name: string,
      parentId?: string,
    ) =>
      request(app.getHttpServer())
        .post('/admin/categories')
        .set(bearer(admin as never))
        .send({
          name,
          description: '',
          icon: '◆',
          color: '#000000',
          ...(parentId ? { parentId } : {}),
        })
        .expect(201);

    async function scenario() {
      const editor = await makeUser(app, { role: 'SUPER_ADMIN' });

      // Portugal > Madeira > Funchal > Sé, plus an unrelated root.
      const pt = await newCategory(editor, 'Portugal');
      const ma = await newCategory(editor, 'Madeira', pt.body.id);
      const fu = await newCategory(editor, 'Funchal', ma.body.id);
      const se = await newCategory(editor, 'Sé', fu.body.id);
      const dp = await newCategory(editor, 'Desporto');

      const created = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(editor))
        .send({
          title: 'Obras na Rua da Sé',
          summary: 's',
          content: '<p>c</p>',
          categoryId: se.body.id,
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/admin/articles/${created.body.id}/publish`)
        .set(bearer(editor))
        .expect(201);

      return {
        editor,
        slugs: {
          pt: pt.body.slug,
          ma: ma.body.slug,
          fu: fu.body.slug,
          se: se.body.slug,
          dp: dp.body.slug,
        },
      };
    }

    const publicTitles = async (query: string) => {
      const res = await request(app.getHttpServer())
        .get(`/public/articles?${query}`)
        .expect(200);
      return (res.body.items as { title: string }[]).map((a) => a.title);
    };

    it('surfaces a leaf article at every level above it', async () => {
      const { slugs } = await scenario();

      expect(await publicTitles(`category=${slugs.se}`)).toContain(
        'Obras na Rua da Sé',
      );
      expect(await publicTitles(`category=${slugs.fu}`)).toContain(
        'Obras na Rua da Sé',
      );
      expect(await publicTitles(`category=${slugs.pt}`)).toContain(
        'Obras na Rua da Sé',
      );
    });

    it('does not leak it into an unrelated branch', async () => {
      const { slugs } = await scenario();

      expect(await publicTitles(`category=${slugs.dp}`)).not.toContain(
        'Obras na Rua da Sé',
      );
    });

    it('the CMS list stays literal unless asked to widen', async () => {
      const { editor, slugs } = await scenario();

      const strict = await request(app.getHttpServer())
        .get(`/admin/articles?category=${slugs.pt}`)
        .set(bearer(editor))
        .expect(200);
      expect(strict.body.items).toHaveLength(0);

      const widened = await request(app.getHttpServer())
        .get(`/admin/articles?category=${slugs.pt}&includeDescendants=true`)
        .set(bearer(editor))
        .expect(200);
      expect(
        (widened.body.items as { title: string }[]).map((a) => a.title),
      ).toContain('Obras na Rua da Sé');
    });

    it('rolls the count up to the ancestors, keeping the direct one honest', async () => {
      const { slugs } = await scenario();

      const res = await request(app.getHttpServer())
        .get('/public/categories')
        .expect(200);
      const portugal = (
        res.body as { slug: string; articleCount: number; articleCountTotal: number }[]
      ).find((c) => c.slug === slugs.pt);

      expect(portugal).toBeDefined();
      // Portugal holds nothing itself, but the reader gets one article.
      expect(portugal!.articleCount).toBe(0);
      expect(portugal!.articleCountTotal).toBe(1);
    });
  });

  /**
   * Nothing internal may reach a public response.
   *
   * These assertions are NEGATIVE on purpose. Prisma's `include` returns
   * every scalar column on the model, so before this was pinned down,
   * each new column on Article was published the day it was added —
   * which is exactly how `draft`, the unpublished text of an article
   * being rewritten, ended up readable by anyone calling the API, and
   * how `rejectionReason`, an editor's private note refusing a piece,
   * had been public since it existed.
   *
   * A test that only checks the fields that SHOULD be there would have
   * passed throughout. This one fails the moment someone reaches for
   * `include` again.
   */
  describe('public responses carry nothing internal', () => {
    const FORBIDDEN = [
      'draft',
      'draftUpdatedAt',
      'draftAwaitingReview',
      'rejectionReason',
      'notificationsQueuedAt',
      'authorId',
      'createdAt',
      'updatedAt',
      'scheduledAt',
    ];

    const leaked = (obj: unknown): string[] =>
      obj && typeof obj === 'object'
        ? FORBIDDEN.filter((f) => f in (obj as Record<string, unknown>))
        : [];

    async function aLiveArticleWithSecrets(editor: TestUser) {
      const created = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(editor))
        .send({
          title: 'Artigo com segredos',
          summary: 's',
          content: '<p>público</p>',
          categoryId,
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/admin/articles/${created.body.id}/publish`)
        .set(bearer(editor))
        .expect(201);
      // Give it both a parked draft and a rejection note, so the test
      // would actually catch a leak rather than pass on empty fields.
      await request(app.getHttpServer())
        .patch(`/admin/articles/${created.body.id}/draft`)
        .set(bearer(editor))
        .send({ content: '<p>TEXTO SECRETO POR PUBLICAR</p>' })
        .expect(200);
      const prisma = app.get(PrismaService);
      await prisma.article.update({
        where: { id: created.body.id },
        data: { rejectionReason: 'NOTA INTERNA DO EDITOR' },
      });
      return created.body as { id: string; slug: string };
    }

    it('by-slug exposes no internal field', async () => {
      const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const article = await aLiveArticleWithSecrets(editor);

      const res = await request(app.getHttpServer())
        .get(`/public/articles/by-slug/${article.slug}`)
        .expect(200);

      expect(leaked(res.body)).toEqual([]);
      // And belt-and-braces: the secret text is nowhere in the payload,
      // however it might have been nested.
      expect(JSON.stringify(res.body)).not.toContain('TEXTO SECRETO');
      expect(JSON.stringify(res.body)).not.toContain('NOTA INTERNA');
    });

    it('the list exposes no internal field', async () => {
      const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
      await aLiveArticleWithSecrets(editor);

      const res = await request(app.getHttpServer())
        .get('/public/articles')
        .expect(200);

      for (const item of res.body.items as unknown[]) {
        expect(leaked(item)).toEqual([]);
      }
      expect(JSON.stringify(res.body)).not.toContain('TEXTO SECRETO');
    });

    it('the homepage bundle exposes no internal field', async () => {
      const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
      await aLiveArticleWithSecrets(editor);

      const res = await request(app.getHttpServer())
        .get('/public/homepage')
        .expect(200);

      expect(leaked(res.body.featured)).toEqual([]);
      for (const bucket of ['side', 'latest', 'investigation'] as const) {
        for (const item of res.body[bucket] as unknown[]) {
          expect(leaked(item)).toEqual([]);
        }
      }
      expect(JSON.stringify(res.body)).not.toContain('TEXTO SECRETO');
    });

    it('related articles expose no internal field', async () => {
      const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const article = await aLiveArticleWithSecrets(editor);
      // A sibling so the related query has something to return.
      await aLiveArticleWithSecrets(editor).catch(() => undefined);

      const res = await request(app.getHttpServer())
        .get(`/public/articles/related/${article.slug}`)
        .expect(200);

      for (const item of res.body as unknown[]) {
        expect(leaked(item)).toEqual([]);
      }
      expect(JSON.stringify(res.body)).not.toContain('TEXTO SECRETO');
    });

    it('the ADMIN list still carries the draft — it is what the editor needs', async () => {
      // Guards the opposite mistake: locking down the admin payload too,
      // which would break the editor reopening on its pending edits.
      const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const article = await aLiveArticleWithSecrets(editor);

      const res = await request(app.getHttpServer())
        .get('/admin/articles')
        .set(bearer(editor))
        .expect(200);

      const row = (res.body.items as { id: string; draft: unknown }[]).find(
        (a) => a.id === article.id,
      );
      expect(row?.draft).toBeTruthy();
    });
  });

  /**
   * Editing a live article must never take it off the site.
   *
   * This is the whole point of the pending-draft column. A journalist
   * fixing a typo on a published piece, who then gets distracted and
   * never clicks anything, must leave the site exactly as it was — while
   * their work is still safe. These tests are what stop a future change
   * from quietly reintroducing "edit = unpublish".
   */
  describe('pending edits on a live article', () => {
    async function livePiece(editor: TestUser) {
      const created = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(editor))
        .send({
          title: 'Peça no ar',
          summary: 'resumo original',
          content: '<p>texto original</p>',
          categoryId,
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/admin/articles/${created.body.id}/publish`)
        .set(bearer(editor))
        .expect(201);
      return created.body as { id: string; slug: string };
    }

    it('keeps the published version on the site while it is edited', async () => {
      const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const article = await livePiece(editor);

      await request(app.getHttpServer())
        .patch(`/admin/articles/${article.id}/draft`)
        .set(bearer(editor))
        .send({ content: '<p>texto a meio de ser reescrito</p>' })
        .expect(200);

      // Still published…
      const admin = await request(app.getHttpServer())
        .get(`/admin/articles/${article.id}`)
        .set(bearer(editor))
        .expect(200);
      expect(admin.body.status).toBe('PUBLICADO');

      // …and the reader still gets the ORIGINAL text, not the draft.
      const publicRes = await request(app.getHttpServer())
        .get(`/public/articles/by-slug/${article.slug}`)
        .expect(200);
      expect(publicRes.body.content).toContain('texto original');
      expect(publicRes.body.content).not.toContain('a meio de ser reescrito');
    });

    it('promotes the draft when someone publishes', async () => {
      const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const article = await livePiece(editor);

      await request(app.getHttpServer())
        .patch(`/admin/articles/${article.id}/draft`)
        .set(bearer(editor))
        .send({ content: '<p>versão final</p>' })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/admin/articles/${article.id}/publish`)
        .set(bearer(editor))
        .expect(201);

      const publicRes = await request(app.getHttpServer())
        .get(`/public/articles/by-slug/${article.slug}`)
        .expect(200);
      expect(publicRes.body.content).toContain('versão final');

      // And the draft is gone, so publishing twice is not a rollback.
      const admin = await request(app.getHttpServer())
        .get(`/admin/articles/${article.id}`)
        .set(bearer(editor))
        .expect(200);
      expect(admin.body.draft).toBeNull();
      expect(admin.body.draftAwaitingReview).toBe(false);
    });

    it('flags a journalist’s edit for approval, and refuses to let them promote it', async () => {
      const chief = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const article = await livePiece(chief);
      // The journalist must be able to edit it at all — editar_todos is
      // not theirs, so make them the author.
      const prisma = app.get(PrismaService);
      const journalist = await makeUser(app, { role: 'JORNALISTA' });
      await prisma.article.update({
        where: { id: article.id },
        data: { authorId: journalist.id },
      });

      await request(app.getHttpServer())
        .patch(`/admin/articles/${article.id}/draft`)
        .set(bearer(journalist))
        .send({ content: '<p>correcção do jornalista</p>' })
        .expect(200);

      const admin = await request(app.getHttpServer())
        .get(`/admin/articles/${article.id}`)
        .set(bearer(chief))
        .expect(200);
      expect(admin.body.draftAwaitingReview).toBe(true);
      expect(admin.body.status).toBe('PUBLICADO');

      // They cannot push their own edit live: /publish falls back to
      // submitForReview for anyone without artigos.publicar.
      const publicRes = await request(app.getHttpServer())
        .get(`/public/articles/by-slug/${article.slug}`)
        .expect(200);
      expect(publicRes.body.content).toContain('texto original');
    });

    it('hands the pending edit back, so the editor can reopen on it', async () => {
      // The bug this pins: the draft was being written and never read
      // back. Reopening the article showed the PUBLISHED text, the
      // author's work looked lost, and the next keystroke would have
      // autosaved the old version straight over the new one.
      const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const article = await livePiece(editor);

      await request(app.getHttpServer())
        .patch(`/admin/articles/${article.id}/draft`)
        .set(bearer(editor))
        .send({ title: 'Título reescrito', content: '<p>corpo reescrito</p>' })
        .expect(200);

      // Both the single-article read and the list must carry it — the
      // editor opens from one and the badge is drawn from the other.
      const one = await request(app.getHttpServer())
        .get(`/admin/articles/${article.id}`)
        .set(bearer(editor))
        .expect(200);
      expect(one.body.draft).toMatchObject({
        title: 'Título reescrito',
        content: '<p>corpo reescrito</p>',
      });
      expect(one.body.draftUpdatedAt).toBeTruthy();
      // The live columns are untouched underneath.
      expect(one.body.title).toBe('Peça no ar');

      const list = await request(app.getHttpServer())
        .get('/admin/articles')
        .set(bearer(editor))
        .expect(200);
      const row = (list.body.items as { id: string; draft: unknown }[]).find(
        (a) => a.id === article.id,
      );
      expect(row?.draft).toBeTruthy();
    });

    it('discards a pending edit without touching what is live', async () => {
      const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const article = await livePiece(editor);

      await request(app.getHttpServer())
        .patch(`/admin/articles/${article.id}/draft`)
        .set(bearer(editor))
        .send({ content: '<p>enganei-me</p>' })
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/admin/articles/${article.id}/draft`)
        .set(bearer(editor))
        .expect(200);

      const publicRes = await request(app.getHttpServer())
        .get(`/public/articles/by-slug/${article.slug}`)
        .expect(200);
      expect(publicRes.body.content).toContain('texto original');
    });
  });

  /**
   * The guarantee the editor's autosave is built on for everything that
   * is NOT live — drafts, articles in review, scheduled ones. There the
   * editor writes straight through, so update() must still leave a field
   * it was not sent alone.
   */
  describe('a PATCH without status leaves the lifecycle alone', () => {
    async function publishedArticle(editor: TestUser) {
      const created = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(editor))
        .send({ title: 'Artigo ao vivo', summary: 's', content: '<p>a</p>', categoryId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/admin/articles/${created.body.id}/publish`)
        .set(bearer(editor))
        .expect(201);
      return created.body.id as string;
    }

    it('keeps a PUBLICADO article published', async () => {
      const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const id = await publishedArticle(editor);

      // Exactly what autosave sends: content, no status.
      await request(app.getHttpServer())
        .patch(`/admin/articles/${id}`)
        .set(bearer(editor))
        .send({ content: '<p>corrigido a meio da escrita</p>' })
        .expect(200);

      const after = await request(app.getHttpServer())
        .get(`/admin/articles/${id}`)
        .set(bearer(editor))
        .expect(200);

      expect(after.body.status).toBe('PUBLICADO');
      expect(after.body.content).toContain('corrigido');
      // And it is still on the public site.
      const publicRes = await request(app.getHttpServer())
        .get(`/public/articles/by-slug/${after.body.slug}`)
        .expect(200);
      expect(publicRes.body.content).toContain('corrigido');
    });

    it('still lets an explicit status change through', async () => {
      // The manual buttons DO send status — this proves the test above
      // is about omission, not about update() ignoring status entirely.
      const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const id = await publishedArticle(editor);

      await request(app.getHttpServer())
        .patch(`/admin/articles/${id}`)
        .set(bearer(editor))
        .send({ status: 'RASCUNHO' })
        .expect(200);

      const after = await request(app.getHttpServer())
        .get(`/admin/articles/${id}`)
        .set(bearer(editor))
        .expect(200);
      expect(after.body.status).toBe('RASCUNHO');
    });
  });

  /**
   * The bug this closes: `status` inside a plain create/update body used
   * to skip `artigos.publicar` entirely. A JORNALISTA — `artigos.criar`
   * and `editar_proprios`, never `publicar` — could self-publish by
   * adding one field to the request the UI never sends, no review, no
   * approval. Neither route checked it; only the dedicated
   * `POST .../publish` button did.
   */
  describe('publishing or scheduling through a plain PATCH/POST needs artigos.publicar', () => {
    it('refuses PATCH …/:id with status: PUBLICADO from someone who cannot publish', async () => {
      const jornalista = await makeUser(app, { role: 'JORNALISTA' });
      const draft = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(jornalista))
        .send({ title: 'Auto-publicação', summary: 's', content: '<p>a</p>', categoryId })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/admin/articles/${draft.body.id}`)
        .set(bearer(jornalista))
        .send({ status: 'PUBLICADO' })
        .expect(403);

      // Refused, not silently downgraded — still exactly what it was.
      const after = await request(app.getHttpServer())
        .get(`/admin/articles/${draft.body.id}`)
        .set(bearer(jornalista))
        .expect(200);
      expect(after.body.status).toBe('RASCUNHO');
      expect(after.body.publishedAt).toBeNull();
    });

    it('refuses PATCH …/:id with status: AGENDADO too — a near-future schedule is a delayed self-publish', async () => {
      const jornalista = await makeUser(app, { role: 'JORNALISTA' });
      const draft = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(jornalista))
        .send({ title: 'Agendamento indevido', summary: 's', content: '<p>a</p>', categoryId })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/admin/articles/${draft.body.id}`)
        .set(bearer(jornalista))
        .send({ status: 'AGENDADO', scheduledAt: new Date(Date.now() + 60_000).toISOString() })
        .expect(403);
    });

    it('refuses POST /admin/articles with status: PUBLICADO in the body', async () => {
      const jornalista = await makeUser(app, { role: 'JORNALISTA' });

      const res = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(jornalista))
        .send({
          title: 'Nasce já publicado',
          summary: 's',
          content: '<p>a</p>',
          categoryId,
          status: 'PUBLICADO',
        })
        .expect(403);

      // And nothing was created at all — not created-then-rejected.
      const list = await request(app.getHttpServer())
        .get('/admin/articles')
        .set(bearer(jornalista))
        .query({ q: 'Nasce já publicado' })
        .expect(200);
      expect(list.body.total).toBe(0);
      void res;
    });

    it('still lets someone who CAN publish create straight into PUBLICADO', async () => {
      // The gate is the permission, not the shape of the request — an
      // EDITOR_CHEFE bootstrapping content (an import script, a seed)
      // has always been allowed to do this and still is.
      const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });

      const res = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(editor))
        .send({
          title: 'Publicado directamente por quem pode',
          summary: 's',
          content: '<p>a</p>',
          categoryId,
          status: 'PUBLICADO',
        })
        .expect(201);

      expect(res.body.status).toBe('PUBLICADO');
      // The bug this whole block exists for: this used to stay NULL,
      // which meant the piece sorted as eternally "newest" and every
      // reader following the category was never told it existed — the
      // notification cron only looks at publishedAt.
      expect(res.body.publishedAt).not.toBeNull();

      const publicRes = await request(app.getHttpServer())
        .get(`/public/articles/by-slug/${res.body.slug}`)
        .expect(200);
      expect(publicRes.body.title).toBe('Publicado directamente por quem pode');
    });

    it('refuses an editar_proprios PATCH to PUBLICADO on the author’s own article', async () => {
      // editar_proprios is "may edit my own drafts", not "may publish
      // them" — the two are different permissions on purpose, and this
      // is the path that most resembles the real exploit: editing your
      // own piece and adding one field.
      const jornalista = await makeUser(app, { role: 'JORNALISTA' });
      const draft = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(jornalista))
        .send({ title: 'Meu rascunho', summary: 's', content: '<p>a</p>', categoryId })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/admin/articles/${draft.body.id}`)
        .set(bearer(jornalista))
        .send({ title: 'Meu rascunho, agora publicado', status: 'PUBLICADO' })
        .expect(403);
    });

    it('creates a draft from the minimum the editor can offer', async () => {
      // Autosave fires as soon as there is a 2-char title and a
      // category — nothing else is typed yet. If CreateArticleDto ever
      // demanded more, autosave would 400 on every keystroke.
      const editor = await makeUser(app, { role: 'EDITOR_CHEFE' });

      const created = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(editor))
        .send({ title: 'Ab', categoryId })
        .expect(201);

      expect(created.body.status).toBe('RASCUNHO');
      expect(created.body.id).toBeTruthy();
    });
  });
});
