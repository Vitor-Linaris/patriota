import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser, bearer } from './helpers/auth';
import { makeReader, readerBearer } from './helpers/reader';
import { truncate } from './helpers/db';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReaderAuthService } from '../src/reader-auth/reader-auth.service';

const DAY = 24 * 60 * 60 * 1000;

describe('Reader suspension (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const SLUG = 'artigo-para-banimentos';

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
    const cat = await prisma.category.create({
      data: {
        slug: 'sociedade',
        name: 'Sociedade',
        description: 'd',
        icon: '◆',
        color: '#1e40af',
        order: 1,
        visible: true,
        path: '/root/',
      },
    });
    const author = await makeUser(app, { role: 'EDITOR_CHEFE' });
    await prisma.article.create({
      data: {
        slug: SLUG,
        title: 'Artigo para banimentos',
        summary: 's',
        content: 'c',
        status: 'PUBLICADO',
        publishedAt: new Date(),
        categoryId: cat.id,
        authorId: author.id,
      },
    });
  });

  // ── who may ban ────────────────────────────────────────────────────

  it('a JORNALISTA cannot ban anybody', async () => {
    const reader = await makeReader(app);
    const journalist = await makeUser(app, { role: 'JORNALISTA' });

    await request(app.getHttpServer())
      .post(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(journalist))
      .send({ duration: 'DIAS_15' })
      .expect(403);
  });

  it('a MODERADOR can', async () => {
    const reader = await makeReader(app);
    const moderator = await makeUser(app, { role: 'MODERADOR' });

    const res = await request(app.getHttpServer())
      .post(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(moderator))
      .send({ duration: 'DIAS_15', reason: 'Insultos.' })
      .expect(200);

    expect(res.body.status).toBe('SUSPENSO');
    expect(new Date(res.body.suspendedUntil).getTime()).toBeGreaterThan(
      Date.now() + 14 * DAY,
    );
    expect(res.body.suspendedBy.id).toBe(moderator.id);
  });

  it('refuses a duration that is not on the list', async () => {
    // "banido 4000 dias" is a permanent ban nobody labelled as one, and
    // it would be invisible to any count of permanent bans.
    const reader = await makeReader(app);
    const moderator = await makeUser(app, { role: 'MODERADOR' });

    await request(app.getHttpServer())
      .post(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(moderator))
      .send({ duration: 'DIAS_4000' })
      .expect(400);
  });

  // ── what a ban does ────────────────────────────────────────────────

  it('a banned reader is barred, and told why and until when', async () => {
    const reader = await makeReader(app);
    const moderator = await makeUser(app, { role: 'MODERADOR' });

    await request(app.getHttpServer())
      .post(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(moderator))
      .send({ duration: 'DIAS_30', reason: 'Insultos repetidos.' })
      .expect(200);

    // The old token is dead — the ban starts now, not when their 30-day
    // cookie happens to run out.
    const res = await request(app.getHttpServer())
      .post(`/public/articles/${SLUG}/comments`)
      .set(readerBearer(reader))
      .send({ body: 'Ainda cá estou' })
      .expect(401);

    // And on a fresh sign-in they get the real story, not "sessão
    // inválida" — a banned reader who thinks the site is broken just
    // makes a second account.
    const login = await request(app.getHttpServer())
      .post('/public/reader/login')
      .send({ email: reader.email, password: 'TestReader123!' })
      .expect(403);
    expect(login.body.message).toContain('Insultos repetidos.');
    expect(login.body.message).toMatch(/suspensa até/);
    expect(res.body.message).toBeDefined();
  });

  it('the thread stays readable to a banned reader', async () => {
    // Barred from taking part, not from reading the newspaper.
    const reader = await makeReader(app);
    const moderator = await makeUser(app, { role: 'MODERADOR' });
    await request(app.getHttpServer())
      .post(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(moderator))
      .send({ duration: 'DIAS_15' })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/public/articles/${SLUG}/comments`)
      .set(readerBearer(reader))
      .expect(200);
  });

  it('optionally wipes what they wrote, and fixes the article count', async () => {
    const reader = await makeReader(app);
    const moderator = await makeUser(app, { role: 'MODERADOR' });

    const c = await request(app.getHttpServer())
      .post(`/public/articles/${SLUG}/comments`)
      .set(readerBearer(reader))
      .send({ body: 'Um comentário qualquer' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/admin/comments/${c.body.id}/approve`)
      .set(bearer(moderator))
      .send({})
      .expect(200);

    let article = await prisma.article.findUnique({ where: { slug: SLUG } });
    expect(article!.commentCount).toBe(1);

    const res = await request(app.getHttpServer())
      .post(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(moderator))
      .send({ duration: 'PERMANENTE', purgeComments: true })
      .expect(200);

    expect(res.body.purgedComments).toBe(1);
    article = await prisma.article.findUnique({ where: { slug: SLUG } });
    expect(article!.commentCount).toBe(0);
  });

  it('leaves the comments alone unless asked', async () => {
    const reader = await makeReader(app);
    const moderator = await makeUser(app, { role: 'MODERADOR' });
    await request(app.getHttpServer())
      .post(`/public/articles/${SLUG}/comments`)
      .set(readerBearer(reader))
      .send({ body: 'Um comentário qualquer' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(moderator))
      .send({ duration: 'DIAS_15' })
      .expect(200);

    expect(res.body.purgedComments).toBe(0);
  });

  // ── how a ban ends ─────────────────────────────────────────────────

  it('expires on its own, with nothing scheduled and nothing run', async () => {
    // The claim being tested is RNF5: no cron, no job, no flag flipped
    // by anyone. The date simply passes. Backdating the row is the only
    // thing this test does between the ban and the login.
    const reader = await makeReader(app);
    const moderator = await makeUser(app, { role: 'MODERADOR' });

    await request(app.getHttpServer())
      .post(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(moderator))
      .send({ duration: 'DIAS_15' })
      .expect(200);

    await prisma.reader.update({
      where: { id: reader.id },
      data: { suspendedUntil: new Date(Date.now() - DAY) },
    });

    const login = await request(app.getHttpServer())
      .post('/public/reader/login')
      .send({ email: reader.email, password: 'TestReader123!' })
      .expect(200);
    expect(login.body.accessToken).toBeTruthy();

    // And the row is tidied on the way past, so the admin list is not
    // left claiming a suspension that ended last week.
    const row = await prisma.reader.findUnique({ where: { id: reader.id } });
    expect(row!.status).toBe('ATIVO');
    expect(row!.suspendedUntil).toBeNull();
    expect(row!.suspensionReason).toBeNull();
  });

  it('a permanent ban never expires', async () => {
    const reader = await makeReader(app);
    const moderator = await makeUser(app, { role: 'MODERADOR' });

    await request(app.getHttpServer())
      .post(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(moderator))
      .send({ duration: 'PERMANENTE' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/public/reader/login')
      .send({ email: reader.email, password: 'TestReader123!' })
      .expect(403);
  });

  it('a moderator can lift a ban early', async () => {
    const reader = await makeReader(app);
    const moderator = await makeUser(app, { role: 'MODERADOR' });

    await request(app.getHttpServer())
      .post(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(moderator))
      .send({ duration: 'PERMANENTE' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(moderator))
      .expect(200);

    await request(app.getHttpServer())
      .post('/public/reader/login')
      .send({ email: reader.email, password: 'TestReader123!' })
      .expect(200);
  });

  it('lifting a ban does not confirm an unconfirmed address', async () => {
    // Otherwise serving a ban would have done the verifying for them.
    const reader = await makeReader(app, {
      verified: false,
      status: 'PENDENTE_VERIFICACAO',
    });
    const moderator = await makeUser(app, { role: 'MODERADOR' });

    await request(app.getHttpServer())
      .post(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(moderator))
      .send({ duration: 'DIAS_15' })
      .expect(200);
    const lifted = await request(app.getHttpServer())
      .delete(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(moderator))
      .expect(200);

    expect(lifted.body.status).toBe('PENDENTE_VERIFICACAO');
  });

  it('an old verification link does not lift a ban', async () => {
    // The bug this pins down: verifyEmail() used to write ATIVO and then
    // test the status it had just written, which of course always
    // passed. A verification link sitting unread in an inbox was a way
    // out of a ban, and the comment above it claimed the opposite.
    //
    // The raw token never leaves the mailer, so it is taken from the
    // service the same way the controller hands it over.
    const reader = await makeReader(app, {
      verified: false,
      status: 'PENDENTE_VERIFICACAO',
    });
    const moderator = await makeUser(app, { role: 'MODERADOR' });

    const issued = await app
      .get(ReaderAuthService)
      .resendVerification(reader.email);
    expect(issued).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(moderator))
      .send({ duration: 'PERMANENTE', reason: 'Spam.' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/public/reader/verify-email')
      .send({ token: issued!.token })
      .expect(403);
    expect(res.body.message).toContain('Spam.');

    const after = await prisma.reader.findUnique({ where: { id: reader.id } });
    expect(after!.status).toBe('SUSPENSO');
    expect(after!.emailVerifiedAt).toBeNull();
  });

  it('but a valid link still works for a reader whose ban has lapsed', async () => {
    // The fix must not go too far the other way: a lapsed ban is no ban.
    const reader = await makeReader(app, {
      verified: false,
      status: 'PENDENTE_VERIFICACAO',
    });
    const moderator = await makeUser(app, { role: 'MODERADOR' });

    const issued = await app
      .get(ReaderAuthService)
      .resendVerification(reader.email);

    await request(app.getHttpServer())
      .post(`/admin/readers/${reader.id}/suspend`)
      .set(bearer(moderator))
      .send({ duration: 'DIAS_15' })
      .expect(200);
    await prisma.reader.update({
      where: { id: reader.id },
      data: { suspendedUntil: new Date(Date.now() - DAY) },
    });

    await request(app.getHttpServer())
      .post('/public/reader/verify-email')
      .send({ token: issued!.token })
      .expect(200);

    const after = await prisma.reader.findUnique({ where: { id: reader.id } });
    expect(after!.status).toBe('ATIVO');
    expect(after!.suspendedUntil).toBeNull();
  });
});
