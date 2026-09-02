import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser } from './helpers/auth';
import { makeReader, readerBearer, type TestReader } from './helpers/reader';
import { truncate } from './helpers/db';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Reader library — favourites & history (e2e)', () => {
  let app: INestApplication;
  let reader: TestReader;
  let articleId = '';
  let draftId = '';
  let categoryId = '';

  beforeAll(async () => {
    process.env.FEATURE_READER_AREA = 'true';
    app = await createTestApp();
  });

  afterAll(async () => {
    await truncate(app, ['Reader', 'Article', 'Category', 'User']);
    await app.close();
  });

  beforeEach(async () => {
    await truncate(app, ['Reader', 'Article', 'Category', 'User']);
    const prisma = app.get(PrismaService);
    const cat = await prisma.category.create({
      data: {
        slug: 'economia',
        name: 'Economia',
        description: 'd',
        icon: '◆',
        color: '#1e40af',
        order: 1,
        visible: true,
        // A live section, which is what these tests are about. The
        // column defaults to FALSE — a category is not offered to
        // readers until somebody says it is ready — so leaving it out
        // would make every follow below a 404, correctly.
        followable: true,
        path: '/root/', // placeholder — these tests never assert on the tree
      },
    });
    categoryId = cat.id;

    const author = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const published = await prisma.article.create({
      data: {
        slug: 'artigo-publicado',
        title: 'Artigo publicado',
        summary: 's',
        content: 'c',
        status: 'PUBLICADO',
        publishedAt: new Date(),
        categoryId: cat.id,
        authorId: author.id,
      },
    });
    articleId = published.id;

    const draft = await prisma.article.create({
      data: {
        slug: 'rascunho-secreto',
        title: 'Rascunho secreto',
        summary: 's',
        content: 'c',
        status: 'RASCUNHO',
        categoryId: cat.id,
        authorId: author.id,
      },
    });
    draftId = draft.id;

    reader = await makeReader(app);
  });

  describe('article favourites', () => {
    it('PUT is idempotent — a double tap leaves one row, not a 500', async () => {
      const url = `/reader/favorites/articles/${articleId}`;
      await request(app.getHttpServer()).put(url).set(readerBearer(reader)).expect(200);
      await request(app.getHttpServer()).put(url).set(readerBearer(reader)).expect(200);

      const list = await request(app.getHttpServer())
        .get('/reader/favorites/articles')
        .set(readerBearer(reader))
        .expect(200);
      expect(list.body.total).toBe(1);
    });

    it('DELETE on something never saved is a no-op, not an error', async () => {
      await request(app.getHttpServer())
        .delete(`/reader/favorites/articles/${articleId}`)
        .set(readerBearer(reader))
        .expect(200);
    });

    it('refuses to save an unpublished article', async () => {
      // Otherwise a guessed id would confirm that a draft exists.
      await request(app.getHttpServer())
        .put(`/reader/favorites/articles/${draftId}`)
        .set(readerBearer(reader))
        .expect(404);
    });

    it('returns enough of the article to render a card', async () => {
      await request(app.getHttpServer())
        .put(`/reader/favorites/articles/${articleId}`)
        .set(readerBearer(reader))
        .expect(200);

      const list = await request(app.getHttpServer())
        .get('/reader/favorites/articles')
        .set(readerBearer(reader))
        .expect(200);

      const item = list.body.items[0];
      expect(item.slug).toBe('artigo-publicado');
      expect(item.title).toBe('Artigo publicado');
      expect(item.category.name).toBe('Economia');
      expect(item.savedAt).toBeDefined();
    });
  });

  describe('category favourites', () => {
    it('follows, reports notify, and unfollows', async () => {
      await request(app.getHttpServer())
        .put(`/reader/favorites/categories/${categoryId}`)
        .set(readerBearer(reader))
        .send({})
        .expect(200);

      let list = await request(app.getHttpServer())
        .get('/reader/favorites/categories')
        .set(readerBearer(reader))
        .expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].notify).toBe(true);

      // Muting e-mails must NOT unfollow — a reader may want the category
      // on their dashboard without the notifications.
      await request(app.getHttpServer())
        .put(`/reader/favorites/categories/${categoryId}`)
        .set(readerBearer(reader))
        .send({ notify: false })
        .expect(200);

      list = await request(app.getHttpServer())
        .get('/reader/favorites/categories')
        .set(readerBearer(reader))
        .expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].notify).toBe(false);

      await request(app.getHttpServer())
        .delete(`/reader/favorites/categories/${categoryId}`)
        .set(readerBearer(reader))
        .expect(200);

      list = await request(app.getHttpServer())
        .get('/reader/favorites/categories')
        .set(readerBearer(reader))
        .expect(200);
      expect(list.body).toHaveLength(0);
    });

    it('404s an unknown category', async () => {
      await request(app.getHttpServer())
        .put('/reader/favorites/categories/nao-existe')
        .set(readerBearer(reader))
        .send({})
        .expect(404);
    });
  });

  describe('the catalogue a reader picks from', () => {
    const prisma = () => app.get(PrismaService);

    /** A section, on offer unless told otherwise. */
    async function section(name: string, over: Record<string, unknown> = {}) {
      return prisma().category.create({
        data: {
          slug: name.toLowerCase(),
          name,
          description: '',
          icon: '◆',
          color: '#1e40af',
          order: 2,
          visible: true,
          followable: true,
          path: `/${name}/`,
          ...over,
        },
      });
    }

    const catalogue = () =>
      request(app.getHttpServer())
        .get('/reader/categories')
        .set(readerBearer(reader))
        .expect(200);

    it('lists every section on offer, followed or not', async () => {
      // The page used to show only what somebody already followed, and
      // to anybody following nothing it said "use the button on an
      // article" — sending them away to find the feature by accident.
      await section('Desporto');

      const res = await catalogue();
      const names = res.body.map((c: { name: string }) => c.name).sort();
      expect(names).toEqual(['Desporto', 'Economia']);
      expect(res.body.every((c: { following: boolean }) => !c.following)).toBe(
        true,
      );
    });

    it('reports what the reader has chosen on each row', async () => {
      await request(app.getHttpServer())
        .put(`/reader/favorites/categories/${categoryId}`)
        .set(readerBearer(reader))
        .send({ notify: false })
        .expect(200);

      const res = await catalogue();
      const eco = res.body.find((c: { id: string }) => c.id === categoryId);
      expect(eco.following).toBe(true);
      expect(eco.notify).toBe(false);
      expect(eco.since).not.toBeNull();
    });

    it('leaves out a section not yet opened to readers', async () => {
      // The whole point of the switch: a category created this morning
      // and still being decided on must not appear in everybody's list
      // the moment somebody typed a name.
      await section('Em Análise', { followable: false });

      const res = await catalogue();
      expect(
        res.body.some((c: { name: string }) => c.name === 'Em Análise'),
      ).toBe(false);
    });

    it('leaves out a section hidden from the site', async () => {
      // Offering to subscribe to something that is not on the menu
      // would be inviting people to a page they cannot reach.
      await section('Escondida', { visible: false });

      const res = await catalogue();
      expect(
        res.body.some((c: { name: string }) => c.name === 'Escondida'),
      ).toBe(false);
    });

    it('refuses to follow a section that is not on offer', async () => {
      // The list is what a reader sees, but the id is guessable and
      // this endpoint is what actually signs somebody up for e-mail.
      const hidden = await section('Fechada', { followable: false });

      await request(app.getHttpServer())
        .put(`/reader/favorites/categories/${hidden.id}`)
        .set(readerBearer(reader))
        .send({})
        .expect(404);
    });

    it('keeps a withdrawn section on the page of whoever follows it', async () => {
      // Otherwise their own follow vanishes with no way to turn it off,
      // and the e-mails keep arriving. Marked rather than hidden.
      await request(app.getHttpServer())
        .put(`/reader/favorites/categories/${categoryId}`)
        .set(readerBearer(reader))
        .send({})
        .expect(200);

      await prisma().category.update({
        where: { id: categoryId },
        data: { followable: false },
      });

      const res = await catalogue();
      const eco = res.body.find((c: { id: string }) => c.id === categoryId);
      expect(eco).toBeDefined();
      expect(eco.following).toBe(true);
      expect(eco.available).toBe(false);

      // And they can still mute it, and still leave.
      await request(app.getHttpServer())
        .put(`/reader/favorites/categories/${categoryId}`)
        .set(readerBearer(reader))
        .send({ notify: false })
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/reader/favorites/categories/${categoryId}`)
        .set(readerBearer(reader))
        .expect(200);

      // Once out, they cannot get back in — it is not on offer.
      await request(app.getHttpServer())
        .put(`/reader/favorites/categories/${categoryId}`)
        .set(readerBearer(reader))
        .send({})
        .expect(404);
    });

    it('needs a reader session', async () => {
      await request(app.getHttpServer()).get('/reader/categories').expect(401);
    });
  });

  describe('reading history', () => {
    it('upserts one row per article and counts repeat reads', async () => {
      const track = () =>
        request(app.getHttpServer())
          .post('/reader/history')
          .set(readerBearer(reader))
          .send({ articleId, progress: 40 });

      await track().expect(201);
      await track().expect(201);

      const list = await request(app.getHttpServer())
        .get('/reader/history')
        .set(readerBearer(reader))
        .expect(200);

      expect(list.body.total).toBe(1);
      expect(list.body.items[0].readCount).toBe(2);
    });

    it('never lets progress go backwards', async () => {
      await request(app.getHttpServer())
        .post('/reader/history')
        .set(readerBearer(reader))
        .send({ articleId, progress: 80 })
        .expect(201);

      // Scrolling back up must not lower the furthest point reached.
      await request(app.getHttpServer())
        .post('/reader/history')
        .set(readerBearer(reader))
        .send({ articleId, progress: 10 })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get('/reader/history')
        .set(readerBearer(reader))
        .expect(200);
      expect(list.body.items[0].progress).toBe(80);
    });

    it('clears on request', async () => {
      await request(app.getHttpServer())
        .post('/reader/history')
        .set(readerBearer(reader))
        .send({ articleId })
        .expect(201);

      await request(app.getHttpServer())
        .delete('/reader/history')
        .set(readerBearer(reader))
        .expect(200);

      const list = await request(app.getHttpServer())
        .get('/reader/history')
        .set(readerBearer(reader))
        .expect(200);
      expect(list.body.total).toBe(0);
    });
  });

  describe('GET /reader/state', () => {
    it('answers everything the article page needs in one call', async () => {
      await request(app.getHttpServer())
        .put(`/reader/favorites/articles/${articleId}`)
        .set(readerBearer(reader))
        .expect(200);
      await request(app.getHttpServer())
        .put(`/reader/favorites/categories/${categoryId}`)
        .set(readerBearer(reader))
        .send({})
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/reader/state?articleId=${articleId}`)
        .set(readerBearer(reader))
        .expect(200);

      expect(res.body).toMatchObject({
        articleId,
        saved: true,
        followingCategory: true,
        categoryNotify: true,
        commentCount: 0,
        inHistory: false,
      });
    });

    it('is not reachable without a reader session', async () => {
      await request(app.getHttpServer())
        .get(`/reader/state?articleId=${articleId}`)
        .expect(401);
    });
  });
});
