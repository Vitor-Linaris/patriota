import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser, bearer, type TestUser } from './helpers/auth';
import { makeReader, readerBearer, type TestReader } from './helpers/reader';
import { truncate } from './helpers/db';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReaderNotificationsService } from '../src/reader-notifications/reader-notifications.service';
import { MailerService } from '../src/mailer/mailer.service';
import { SettingsService } from '../src/settings/settings.service';

/**
 * The notification fan-out.
 *
 * The load-bearing assertion here is that an article reaching PUBLICADO
 * through ANY of the four publish paths gets queued exactly once. The
 * poller design exists precisely because hooking publish() would miss
 * three of them, so a regression that reintroduced a hook would look fine
 * everywhere except this file.
 */
describe('Reader notifications (e2e)', () => {
  let app: INestApplication;
  let service: ReaderNotificationsService;
  let prisma: PrismaService;
  let editor: TestUser;
  let reader: TestReader;
  let categoryId = '';

  beforeAll(async () => {
    process.env.FEATURE_READER_AREA = 'true';
    app = await createTestApp();
    service = app.get(ReaderNotificationsService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await truncate(app, [
      'ArticleNotification',
      'CategoryFavorite',
      'Reader',
      'Article',
      'Category',
      'User',
    ]);
    await app.close();
  });

  beforeEach(async () => {
    await truncate(app, [
      'ArticleNotification',
      'CategoryFavorite',
      'Reader',
      'Article',
      'Category',
      'User',
    ]);

    const cat = await prisma.category.create({
      data: {
        slug: 'politica',
        name: 'Política',
        description: 'd',
        icon: '◆',
        color: '#1e40af',
        order: 1,
        visible: true,
        // A live section. The column defaults to FALSE — a category is
        // not offered to readers until somebody opens it — so without
        // this the follow below is refused and every notification test
        // fails for a reason that has nothing to do with notifications.
        followable: true,
        path: '/root/', // placeholder — these tests never assert on the tree
      },
    });
    categoryId = cat.id;

    editor = await makeUser(app, { role: 'EDITOR_CHEFE' });
    reader = await makeReader(app);

    // Follow the category, which is what makes the reader eligible.
    await request(app.getHttpServer())
      .put(`/reader/favorites/categories/${categoryId}`)
      .set(readerBearer(reader))
      .send({})
      .expect(200);
  });

  const notificationsFor = (articleId: string) =>
    prisma.articleNotification.findMany({ where: { articleId } });

  describe('every publish path queues exactly once', () => {
    it('via ArticlesService.publish()', async () => {
      const created = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(editor))
        .send({ title: 'Publicado pelo verbo', categoryId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/admin/articles/${created.body.id}/publish`)
        .set(bearer(editor))
        .send({})
        .expect(201);

      await service.enqueueDueArticles();
      expect(await notificationsFor(created.body.id)).toHaveLength(1);
    });

    it('via POST /admin/articles with an explicit status', async () => {
      // create() takes status straight from the DTO, never touching publish().
      const created = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(editor))
        .send({
          title: 'Publicado à nascença',
          categoryId,
          status: 'PUBLICADO',
        })
        .expect(201);

      await prisma.article.update({
        where: { id: created.body.id },
        data: { publishedAt: new Date() },
      });

      await service.enqueueDueArticles();
      expect(await notificationsFor(created.body.id)).toHaveLength(1);
    });

    it('via PATCH /admin/articles/:id changing status', async () => {
      // update() spreads the DTO, so this writes status directly too.
      const created = await request(app.getHttpServer())
        .post('/admin/articles')
        .set(bearer(editor))
        .send({ title: 'Publicado por PATCH', categoryId })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/admin/articles/${created.body.id}`)
        .set(bearer(editor))
        .send({ status: 'PUBLICADO' })
        .expect(200);

      await prisma.article.update({
        where: { id: created.body.id },
        data: { publishedAt: new Date() },
      });

      await service.enqueueDueArticles();
      expect(await notificationsFor(created.body.id)).toHaveLength(1);
    });

    it('via the scheduler promoting an AGENDADO article', async () => {
      const article = await prisma.article.create({
        data: {
          slug: 'agendado-e-promovido',
          title: 'Agendado e promovido',
          summary: 's',
          content: 'c',
          status: 'PUBLICADO',
          publishedAt: new Date(),
          categoryId,
          authorId: editor.id,
        },
      });

      await service.enqueueDueArticles();
      expect(await notificationsFor(article.id)).toHaveLength(1);
    });
  });

  it('running the poller twice does not duplicate anything', async () => {
    const article = await prisma.article.create({
      data: {
        slug: 'artigo-idempotente',
        title: 'Artigo idempotente',
        summary: 's',
        content: 'c',
        status: 'PUBLICADO',
        publishedAt: new Date(),
        categoryId,
        authorId: editor.id,
      },
    });

    const first = await service.enqueueDueArticles();
    const second = await service.enqueueDueArticles();

    expect(first).toBe(1);
    // The atomic claim on notificationsQueuedAt means the second pass
    // finds nothing to do — this is what makes restarts and multiple API
    // instances safe.
    expect(second).toBe(0);
    expect(await notificationsFor(article.id)).toHaveLength(1);
  });

  it('never queues an article published before the lookback window', async () => {
    // The archive guard. Combined with the migration backfill, this is
    // what stops go-live from mailing every reader the whole back
    // catalogue.
    const old = await prisma.article.create({
      data: {
        slug: 'artigo-do-arquivo',
        title: 'Artigo do arquivo',
        summary: 's',
        content: 'c',
        status: 'PUBLICADO',
        publishedAt: new Date(Date.now() - 30 * 86_400_000),
        categoryId,
        authorId: editor.id,
      },
    });

    await service.enqueueDueArticles();
    expect(await notificationsFor(old.id)).toHaveLength(0);
  });

  describe('eligibility', () => {
    async function publishOne(slug: string) {
      return prisma.article.create({
        data: {
          slug,
          title: `Artigo ${slug}`,
          summary: 's',
          content: 'c',
          status: 'PUBLICADO',
          publishedAt: new Date(),
          categoryId,
          authorId: editor.id,
        },
      });
    }

    it('skips a reader who muted the category but kept following it', async () => {
      await request(app.getHttpServer())
        .put(`/reader/favorites/categories/${categoryId}`)
        .set(readerBearer(reader))
        .send({ notify: false })
        .expect(200);

      const article = await publishOne('mudo-por-categoria');
      await service.enqueueDueArticles();

      expect(await notificationsFor(article.id)).toHaveLength(0);
      // Still following — the favourite and the mute are separate things.
      const fav = await prisma.categoryFavorite.findMany({
        where: { readerId: reader.id },
      });
      expect(fav).toHaveLength(1);
    });

    it('skips a reader who turned all notifications off', async () => {
      await request(app.getHttpServer())
        .patch('/reader/me')
        .set(readerBearer(reader))
        .send({ notifyNewArticles: false })
        .expect(200);

      const article = await publishOne('sem-notificacoes');
      await service.enqueueDueArticles();
      expect(await notificationsFor(article.id)).toHaveLength(0);
    });

    it('skips a reader on NUNCA', async () => {
      await request(app.getHttpServer())
        .patch('/reader/me')
        .set(readerBearer(reader))
        .send({ digestFrequency: 'NUNCA' })
        .expect(200);

      const article = await publishOne('frequencia-nunca');
      await service.enqueueDueArticles();
      expect(await notificationsFor(article.id)).toHaveLength(0);
    });

    it('skips a reader who never confirmed their e-mail', async () => {
      const unverified = await makeReader(app, {
        verified: false,
        status: 'PENDENTE_VERIFICACAO',
      });
      await prisma.categoryFavorite.create({
        data: { readerId: unverified.id, categoryId },
      });

      const article = await publishOne('por-confirmar');
      await service.enqueueDueArticles();

      const rows = await notificationsFor(article.id);
      // The verified reader gets one; the unverified one does not.
      expect(rows).toHaveLength(1);
      expect(rows[0]!.readerId).toBe(reader.id);
    });
  });

  describe('unsubscribe', () => {
    it('mutes a single category without unfollowing it', async () => {
      const row = await prisma.reader.findUnique({
        where: { id: reader.id },
        select: { unsubscribeToken: true },
      });

      await request(app.getHttpServer())
        .post('/public/reader/unsubscribe')
        .send({ token: row!.unsubscribeToken, categoryId })
        .expect(200);

      const fav = await prisma.categoryFavorite.findFirst({
        where: { readerId: reader.id, categoryId },
      });
      expect(fav!.notify).toBe(false);

      const me = await prisma.reader.findUnique({ where: { id: reader.id } });
      expect(me!.notifyNewArticles).toBe(true);
    });

    it('stops every notification e-mail when asked globally', async () => {
      const row = await prisma.reader.findUnique({
        where: { id: reader.id },
        select: { unsubscribeToken: true },
      });

      await request(app.getHttpServer())
        .post('/public/reader/unsubscribe')
        .send({ token: row!.unsubscribeToken, all: true })
        .expect(200);

      const me = await prisma.reader.findUnique({ where: { id: reader.id } });
      expect(me!.notifyNewArticles).toBe(false);
      expect(me!.digestFrequency).toBe('NUNCA');
    });

    it('rejects an unknown token', async () => {
      await request(app.getHttpServer())
        .post('/public/reader/unsubscribe')
        .send({ token: 'nao-existe-de-todo', all: true })
        .expect(404);
    });

    it('works with no session at all', async () => {
      // RFC 8058 requires the List-Unsubscribe target to work without a
      // cookie; the token IS the authorisation.
      const row = await prisma.reader.findUnique({
        where: { id: reader.id },
        select: { unsubscribeToken: true },
      });

      await request(app.getHttpServer())
        .get(`/public/reader/unsubscribe?t=${encodeURIComponent(row!.unsubscribeToken)}`)
        .expect(200);
    });
  });

  describe('delivery', () => {
    it('groups everything a reader is owed into one message', async () => {
      // emailArticlePublished defaults to FALSE in settings.service.ts —
      // the newsroom opts in to digests. Turn it on for this case, which
      // also proves the kill switch is actually consulted.
      await app
        .get(SettingsService)
        .put('email', { emailArticlePublished: true });

      const mailer = app.get(MailerService);
      const spy = jest
        .spyOn(mailer, 'sendOrThrow')
        .mockResolvedValue({ messageId: 'test' });

      await request(app.getHttpServer())
        .patch('/reader/me')
        .set(readerBearer(reader))
        .send({ digestFrequency: 'IMEDIATO' })
        .expect(200);

      for (const slug of ['digest-um', 'digest-dois', 'digest-tres']) {
        await prisma.article.create({
          data: {
            slug,
            title: `Artigo ${slug}`,
            summary: 's',
            content: 'c',
            status: 'PUBLICADO',
            publishedAt: new Date(),
            categoryId,
            authorId: editor.id,
          },
        });
      }

      await service.enqueueDueArticles();
      const sent = await service.deliver('IMEDIATO');

      // Three articles, ONE e-mail. Sending three would train readers to
      // mark the paper as spam.
      expect(sent).toBe(1);
      expect(spy).toHaveBeenCalledTimes(1);

      const message = spy.mock.calls[0]![0] as {
        headers?: Record<string, string>;
        text: string;
      };
      expect(message.headers?.['List-Unsubscribe']).toBeDefined();
      expect(message.headers?.['List-Unsubscribe-Post']).toBe(
        'List-Unsubscribe=One-Click',
      );

      const rows = await prisma.articleNotification.findMany({
        where: { readerId: reader.id },
      });
      expect(rows.every((r) => r.status === 'ENVIADO')).toBe(true);

      spy.mockRestore();
      await app.get(SettingsService).put('email', {});
    });

    it('sends nothing while the newsroom kill switch is off', async () => {
      await app
        .get(SettingsService)
        .put('email', { emailArticlePublished: false });

      const spy = jest
        .spyOn(app.get(MailerService), 'sendOrThrow')
        .mockResolvedValue({ messageId: 'test' });

      await request(app.getHttpServer())
        .patch('/reader/me')
        .set(readerBearer(reader))
        .send({ digestFrequency: 'IMEDIATO' })
        .expect(200);

      await prisma.article.create({
        data: {
          slug: 'nao-deve-sair',
          title: 'Não deve sair',
          summary: 's',
          content: 'c',
          status: 'PUBLICADO',
          publishedAt: new Date(),
          categoryId,
          authorId: editor.id,
        },
      });

      await service.enqueueDueArticles();
      // Queued, but not delivered: turning the switch back on later must
      // not lose the backlog.
      expect(await service.deliver('IMEDIATO')).toBe(0);
      expect(spy).not.toHaveBeenCalled();

      const rows = await prisma.articleNotification.findMany({
        where: { readerId: reader.id, status: 'PENDENTE' },
      });
      expect(rows.length).toBeGreaterThan(0);

      spy.mockRestore();
      await app.get(SettingsService).put('email', {});
    });
  });

  /**
   * The roll-up, against the real database and a real tree cache.
   *
   * Categories are created through the ADMIN API rather than Prisma
   * directly, because that is what invalidates the cached tree — seeding
   * rows behind the service's back would leave resolveAncestorIds
   * reading a tree that predates them, and the test would pass or fail
   * on cache timing rather than on behaviour.
   */
  describe('roll-up to ancestor categories', () => {
    let admin: TestUser;
    let chain: { pt: string; ma: string; fu: string; se: string };

    const mkCategory = (name: string, parentId?: string) =>
      request(app.getHttpServer())
        .post('/admin/categories')
        .set(bearer(admin))
        .send({
          name,
          description: '',
          icon: '◆',
          color: '#000000',
          // Opened to readers, which a new category is NOT by default —
          // an editor turns it on when the section is ready. These tests
          // are about the notification roll-up, so the sections start
          // where that story begins: already on offer.
          followable: true,
          ...(parentId ? { parentId } : {}),
        })
        .expect(201);

    const follow = (categoryId: string) =>
      request(app.getHttpServer())
        .put(`/reader/favorites/categories/${categoryId}`)
        .set(readerBearer(reader))
        .send({})
        .expect(200);

    /** Publishes into Sé, four levels down, and runs the poller. */
    async function publishInSe(slug: string) {
      const article = await prisma.article.create({
        data: {
          slug,
          title: 'Obras na Rua da Sé',
          summary: 's',
          content: 'c',
          status: 'PUBLICADO',
          publishedAt: new Date(),
          categoryId: chain.se,
          authorId: editor.id,
        },
      });
      await service.enqueueDueArticles();
      return article.id;
    }

    beforeEach(async () => {
      admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      const pt = await mkCategory('Portugal');
      const ma = await mkCategory('Madeira', pt.body.id);
      const fu = await mkCategory('Funchal', ma.body.id);
      const se = await mkCategory('Sé', fu.body.id);
      chain = {
        pt: pt.body.id,
        ma: ma.body.id,
        fu: fu.body.id,
        se: se.body.id,
      };
    });

    it('reaches a reader who follows only the root', async () => {
      // Nobody follows Sé. Following Portugal has to be enough, or
      // creating a subsection would quietly cut existing followers off
      // from coverage they were already getting.
      await follow(chain.pt);

      const articleId = await publishInSe('roll-up-raiz');

      expect(await notificationsFor(articleId)).toHaveLength(1);
    });

    it('sends exactly ONE to a reader following the parent AND the child', async () => {
      // The test that matters. Four fan-out passes match this reader
      // twice; @@unique([readerId, articleId]) with skipDuplicates has to
      // collapse them into a single row, and so a single e-mail.
      await follow(chain.pt);
      await follow(chain.se);

      const articleId = await publishInSe('roll-up-duplo');

      expect(await notificationsFor(articleId)).toHaveLength(1);
    });

    it('does not reach a reader following an unrelated branch', async () => {
      const desporto = await mkCategory('Desporto');
      await follow(desporto.body.id);

      const articleId = await publishInSe('roll-up-outro-ramo');

      expect(await notificationsFor(articleId)).toHaveLength(0);
    });

    it('respects a mute on the followed category', async () => {
      // notify:false is the per-category mute, deliberately distinct
      // from unfollowing. Rolling up must not resurrect it.
      await request(app.getHttpServer())
        .put(`/reader/favorites/categories/${chain.pt}`)
        .set(readerBearer(reader))
        .send({ notify: false })
        .expect(200);

      const articleId = await publishInSe('roll-up-silenciado');

      expect(await notificationsFor(articleId)).toHaveLength(0);
    });

    it('delivers a single e-mail for the whole chain', async () => {
      // emailArticlePublished defaults to FALSE — the newsroom opts in.
      await app
        .get(SettingsService)
        .put('email', { emailArticlePublished: true });
      const spy = jest
        .spyOn(app.get(MailerService), 'sendOrThrow')
        .mockResolvedValue({ messageId: 'test' });

      await request(app.getHttpServer())
        .patch('/reader/me')
        .set(readerBearer(reader))
        .send({ digestFrequency: 'IMEDIATO' })
        .expect(200);

      await follow(chain.pt);
      await follow(chain.ma);
      await follow(chain.se);

      await publishInSe('roll-up-um-email');
      const sent = await service.deliver('IMEDIATO');

      // Three follows along one chain, one message.
      expect(sent).toBe(1);
      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockRestore();
      await app.get(SettingsService).put('email', {});
    });
  });
});
