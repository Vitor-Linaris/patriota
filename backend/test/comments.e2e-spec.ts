import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser, bearer } from './helpers/auth';
import { makeReader, readerBearer, type TestReader } from './helpers/reader';
import { truncate } from './helpers/db';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Comments (e2e)', () => {
  let app: INestApplication;
  let articleId = '';
  const SLUG = 'artigo-com-comentarios';

  beforeAll(async () => {
    process.env.FEATURE_READER_AREA = 'true';
    app = await createTestApp();
  });

  afterAll(async () => {
    await truncate(app, ['Comment', 'Reader', 'Article', 'Category', 'User']);
    await app.close();
  });

  beforeEach(async () => {
    await truncate(app, ['Comment', 'Reader', 'Article', 'Category', 'User']);
    const prisma = app.get(PrismaService);
    const cat = await prisma.category.create({
      data: {
        slug: 'sociedade',
        name: 'Sociedade',
        description: 'd',
        icon: '◆',
        color: '#1e40af',
        order: 1,
        visible: true,
        path: '/root/', // placeholder — these tests never assert on the tree
      },
    });
    const author = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const article = await prisma.article.create({
      data: {
        slug: SLUG,
        title: 'Artigo com comentários',
        summary: 's',
        content: 'c',
        status: 'PUBLICADO',
        publishedAt: new Date(),
        categoryId: cat.id,
        authorId: author.id,
      },
    });
    articleId = article.id;
  });

  const post = (reader: TestReader, body: string, parentId?: string) =>
    request(app.getHttpServer())
      .post(`/public/articles/${SLUG}/comments`)
      .set(readerBearer(reader))
      .send({ body, ...(parentId ? { parentId } : {}) });

  it('refuses an anonymous post but serves the thread anonymously', async () => {
    await request(app.getHttpServer())
      .post(`/public/articles/${SLUG}/comments`)
      .send({ body: 'Comentário anónimo' })
      .expect(401);

    await request(app.getHttpServer())
      .get(`/public/articles/${SLUG}/comments`)
      .expect(200);
  });

  it('refuses a reader who has not confirmed their e-mail', async () => {
    const unverified = await makeReader(app, {
      verified: false,
      status: 'PENDENTE_VERIFICACAO',
    });
    await post(unverified, 'Ainda não confirmei o e-mail').expect(403);
  });

  it('a new comment is PENDENTE: hidden from others, visible to its author', async () => {
    const author = await makeReader(app);
    const other = await makeReader(app);

    const created = await post(author, 'O meu primeiro comentário').expect(201);
    expect(created.body.status).toBe('PENDENTE');

    // Anonymous sees nothing.
    const anon = await request(app.getHttpServer())
      .get(`/public/articles/${SLUG}/comments`)
      .expect(200);
    expect(anon.body.total).toBe(0);

    // Another logged-in reader sees nothing either.
    const stranger = await request(app.getHttpServer())
      .get(`/public/articles/${SLUG}/comments`)
      .set(readerBearer(other))
      .expect(200);
    expect(stranger.body.total).toBe(0);

    // The author sees their own, so posting does not look like it failed.
    const mine = await request(app.getHttpServer())
      .get(`/public/articles/${SLUG}/comments`)
      .set(readerBearer(author))
      .expect(200);
    expect(mine.body.total).toBe(1);
    expect(mine.body.items[0].author.isMe).toBe(true);
  });

  it('a MODERADOR approves and the comment goes public', async () => {
    const reader = await makeReader(app);
    const created = await post(reader, 'Comentário para aprovar').expect(201);
    const moderator = await makeUser(app, { role: 'MODERADOR' });

    await request(app.getHttpServer())
      .post(`/admin/comments/${created.body.id}/approve`)
      .set(bearer(moderator))
      .send({})
      .expect(200);

    const anon = await request(app.getHttpServer())
      .get(`/public/articles/${SLUG}/comments`)
      .expect(200);
    expect(anon.body.total).toBe(1);
    expect(anon.body.items[0].body).toBe('Comentário para aprovar');
  });

  it('a JORNALISTA cannot moderate', async () => {
    const reader = await makeReader(app);
    const created = await post(reader, 'Comentário protegido').expect(201);
    const journalist = await makeUser(app, { role: 'JORNALISTA' });

    await request(app.getHttpServer())
      .post(`/admin/comments/${created.body.id}/approve`)
      .set(bearer(journalist))
      .send({})
      .expect(403);
  });

  it('keeps Article.commentCount in step with approvals', async () => {
    const prisma = app.get(PrismaService);
    const reader = await makeReader(app);
    const moderator = await makeUser(app, { role: 'MODERADOR' });

    const a = await post(reader, 'Primeiro comentário').expect(201);
    // Pending comments must not count — the badge on the article would
    // otherwise promise comments nobody can read.
    let article = await prisma.article.findUnique({ where: { id: articleId } });
    expect(article!.commentCount).toBe(0);

    await request(app.getHttpServer())
      .post(`/admin/comments/${a.body.id}/approve`)
      .set(bearer(moderator))
      .send({})
      .expect(200);

    article = await prisma.article.findUnique({ where: { id: articleId } });
    expect(article!.commentCount).toBe(1);

    await request(app.getHttpServer())
      .delete(`/admin/comments/${a.body.id}`)
      .set(bearer(moderator))
      .expect(200);

    article = await prisma.article.findUnique({ where: { id: articleId } });
    expect(article!.commentCount).toBe(0);
  });

  it('strips HTML from the body', async () => {
    const reader = await makeReader(app);
    const res = await post(
      reader,
      'Olá <script>alert(1)</script><b>mundo</b>',
    ).expect(201);
    expect(res.body.body).not.toContain('<');
    expect(res.body.body).toContain('mundo');
  });

  describe('length limit', () => {
    it('accepts a comment right on the limit', async () => {
      const reader = await makeReader(app);
      await post(reader, 'a'.repeat(280)).expect(201);
    });

    it('refuses one character over, and says by how much', async () => {
      const reader = await makeReader(app);
      const res = await post(reader, 'a'.repeat(281)).expect(400);
      expect(res.body.message).toMatch(/281 caracteres/);
      expect(res.body.message).toMatch(/280/);
    });

    it('measures after the tags come off, not before', async () => {
      // Markup the reader never typed — pasted out of a word processor —
      // must not eat their allowance. 270 characters of text wrapped in
      // spans is well over 280 raw and well under it once stripped.
      const reader = await makeReader(app);
      const wrapped = `<span class="x">${'a'.repeat(270)}</span>`;
      expect(wrapped.length).toBeGreaterThan(280);

      const res = await post(reader, wrapped).expect(201);
      expect(res.body.body).toBe('a'.repeat(270));
    });

    it('refuses rather than silently truncating', async () => {
      // The old code sliced at the cap. At 280 that would publish half
      // an argument under the reader's name, with no sign anything was
      // lost.
      const reader = await makeReader(app);
      await post(reader, 'a'.repeat(400)).expect(400);
      const count = await app
        .get(PrismaService)
        .comment.count({ where: { articleId } });
      expect(count).toBe(0);
    });

    it('stops an absurd paste at the door', async () => {
      // Past the DTO's raw ceiling, so it never reaches the sanitiser.
      const reader = await makeReader(app);
      await post(reader, 'a'.repeat(50_000)).expect(400);
    });

    it('applies the same limit to an edit', async () => {
      const reader = await makeReader(app);
      const created = await post(reader, 'Comentário curto').expect(201);

      await request(app.getHttpServer())
        .patch(`/public/comments/${created.body.id}`)
        .set(readerBearer(reader))
        .send({ body: 'a'.repeat(281) })
        .expect(400);
    });
  });

  it('caps threads at two levels by re-parenting onto the root', async () => {
    const reader = await makeReader(app);
    const root = await post(reader, 'Comentário raiz').expect(201);
    const reply = await post(reader, 'Resposta', root.body.id).expect(201);
    expect(reply.body.parentId).toBe(root.body.id);

    // A reply to the reply must land back on the root, not nest deeper.
    const deep = await post(reader, 'Resposta da resposta', reply.body.id).expect(
      201,
    );
    expect(deep.body.parentId).toBe(root.body.id);
  });

  it('refuses to let a reader edit or delete somebody else', async () => {
    const owner = await makeReader(app);
    const attacker = await makeReader(app);
    const created = await post(owner, 'Comentário do dono').expect(201);

    await request(app.getHttpServer())
      .patch(`/public/comments/${created.body.id}`)
      .set(readerBearer(attacker))
      .send({ body: 'Sequestrado' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/public/comments/${created.body.id}`)
      .set(readerBearer(attacker))
      .expect(403);
  });

  it('sends an edited comment back through moderation', async () => {
    const reader = await makeReader(app);
    const moderator = await makeUser(app, { role: 'MODERADOR' });
    const created = await post(reader, 'Texto original').expect(201);

    await request(app.getHttpServer())
      .post(`/admin/comments/${created.body.id}/approve`)
      .set(bearer(moderator))
      .send({})
      .expect(200);

    const edited = await request(app.getHttpServer())
      .patch(`/public/comments/${created.body.id}`)
      .set(readerBearer(reader))
      .send({ body: 'Texto completamente diferente' })
      .expect(200);

    // Otherwise an approved comment could be rewritten into anything.
    expect(edited.body.status).toBe('PENDENTE');

    const anon = await request(app.getHttpServer())
      .get(`/public/articles/${SLUG}/comments`)
      .expect(200);
    expect(anon.body.total).toBe(0);
  });

  it('lists the reader their own comments with the article attached', async () => {
    const reader = await makeReader(app);
    await post(reader, 'Comentário para o painel').expect(201);

    const res = await request(app.getHttpServer())
      .get('/reader/comments')
      .set(readerBearer(reader))
      .expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].article.slug).toBe(SLUG);
    expect(res.body.items[0].article.title).toBe('Artigo com comentários');
  });

  it('shows an anonymised reader as "Leitor removido" without losing the thread', async () => {
    const reader = await makeReader(app);
    const moderator = await makeUser(app, { role: 'MODERADOR' });
    const created = await post(reader, 'Comentário de quem se foi embora').expect(201);
    await request(app.getHttpServer())
      .post(`/admin/comments/${created.body.id}/approve`)
      .set(bearer(moderator))
      .send({})
      .expect(200);

    await request(app.getHttpServer())
      .delete('/reader/me')
      .set(readerBearer(reader))
      .expect(204);

    const anon = await request(app.getHttpServer())
      .get(`/public/articles/${SLUG}/comments`)
      .expect(200);
    // The comment survives erasure; only the identity goes.
    expect(anon.body.total).toBe(1);
    expect(anon.body.items[0].author.name).toBe('Leitor removido');
    expect(anon.body.items[0].body).toBe('Comentário de quem se foi embora');
  });
});
