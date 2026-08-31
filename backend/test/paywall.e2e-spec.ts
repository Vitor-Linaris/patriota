import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser } from './helpers/auth';
import { makeReader, readerBearer, type TestReader } from './helpers/reader';
import { truncate } from './helpers/db';
import { PrismaService } from '../src/prisma/prisma.service';

const SECRET = 'O PARAGRAFO QUE SO OS ASSINANTES LEEM';

/**
 * A body long enough that the preview budget actually bites, with the
 * marker in the LAST paragraph. An article shorter than the budget would
 * come back whole and the test would be measuring nothing.
 */
const BODY =
  '<p>Abertura visível a toda a gente, com texto que chega para encher a amostra sem ser demasiado curto para o efeito.</p>'.repeat(
    20,
  ) + `<p>${SECRET}</p>`;

describe('Paywall (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let subscriber: TestReader;
  let freeReader: TestReader;

  beforeAll(async () => {
    process.env.FEATURE_READER_AREA = 'true';
    process.env.FEATURE_PAYWALL = 'true';
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await truncate(app, ['Comment', 'Reader', 'Article', 'Category', 'User']);
    await app.close();
    delete process.env.FEATURE_PAYWALL;
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

    for (const [slug, exclusive] of [
      ['artigo-exclusivo', true],
      ['artigo-aberto', false],
    ] as const) {
      await prisma.article.create({
        data: {
          slug,
          title: slug,
          summary: 's',
          content: BODY,
          status: 'PUBLICADO',
          exclusive,
          publishedAt: new Date(),
          categoryId: cat.id,
          authorId: author.id,
        },
      });
    }

    freeReader = await makeReader(app);
    subscriber = await makeReader(app);
    await prisma.reader.update({
      where: { id: subscriber.id },
      data: { plan: 'PREMIUM' },
    });
  });

  const get = (slug: string, reader?: TestReader) => {
    const req = request(app.getHttpServer()).get(
      `/public/articles/by-slug/${slug}`,
    );
    return reader ? req.set(readerBearer(reader)) : req;
  };

  it('an anonymous visitor gets the opening and not the article', async () => {
    const res = await get('artigo-exclusivo').expect(200);

    expect(res.body.paywalled).toBe(true);
    expect(res.body.contentPreview).toBeTruthy();
    // Not blanked — ABSENT. An empty string would still be a key, and the
    // next `content ?? contentPreview` would render nothing at all.
    expect('content' in res.body).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it('a free reader gets exactly the same', async () => {
    // Having an account is not having a subscription.
    const res = await get('artigo-exclusivo', freeReader).expect(200);
    expect(res.body.paywalled).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it('a subscriber gets the whole thing', async () => {
    const res = await get('artigo-exclusivo', subscriber).expect(200);
    expect(res.body.content).toContain(SECRET);
    expect(res.body.paywalled).toBeUndefined();
    expect(res.body.contentPreview).toBeUndefined();
  });

  it('a non-exclusive article is untouched for everyone', async () => {
    for (const who of [undefined, freeReader, subscriber]) {
      const res = await get('artigo-aberto', who).expect(200);
      expect(res.body.content).toContain(SECRET);
      expect(res.body.paywalled).toBeUndefined();
    }
  });

  // ── the ways round it ───────────────────────────────────────────────

  it('the list endpoint does not hand out the body', async () => {
    // The obvious way round a paywall on the article page: ask for the
    // list instead. The card select carries no `content` at all, so
    // there is nothing to withhold — for exclusives or anything else.
    const res = await request(app.getHttpServer())
      .get('/public/articles')
      .expect(200);

    expect(res.body.items.length).toBe(2);
    for (const item of res.body.items) expect('content' in item).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it('nor does the homepage, nor related', async () => {
    const home = await request(app.getHttpServer())
      .get('/public/homepage')
      .expect(200);
    expect(JSON.stringify(home.body)).not.toContain(SECRET);
    expect('content' in (home.body.featured ?? {})).toBe(false);

    const related = await request(app.getHttpServer())
      .get('/public/articles/related/artigo-aberto')
      .expect(200);
    expect(JSON.stringify(related.body)).not.toContain(SECRET);
  });

  it('a stale reader token degrades to anonymous instead of failing', async () => {
    // These cookies live 30 days. An expired one must leave the article
    // page working for what is, at that point, a logged-out visitor.
    const res = await request(app.getHttpServer())
      .get('/public/articles/by-slug/artigo-aberto')
      .set({ Authorization: 'Bearer nao.e.um.token' })
      .expect(200);
    expect(res.body.content).toContain(SECRET);
  });

  it('a subscription that has run out stops opening the article', async () => {
    // The end of the loop that stage 5 closes: a gift with a date is
    // only worth something if the date is enforced where it counts.
    // Backdating the row is the only thing that happens here — no job,
    // no sweep, no second request to trigger anything.
    await prisma.reader.update({
      where: { id: subscriber.id },
      data: { planRenewsAt: new Date(Date.now() - 60_000) },
    });

    const res = await get('artigo-exclusivo', subscriber).expect(200);
    expect(res.body.paywalled).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it('one that has not run out still opens it', async () => {
    await prisma.reader.update({
      where: { id: subscriber.id },
      data: { planRenewsAt: new Date(Date.now() + 60_000) },
    });

    const res = await get('artigo-exclusivo', subscriber).expect(200);
    expect(res.body.content).toContain(SECRET);
  });

  it('a suspended subscriber still reads the paper', async () => {
    // Banned from taking part, not from what they paid for. The optional
    // guard drops the principal, so they read as anonymous — which for a
    // suspended account is the right answer, not an error page.
    await prisma.reader.update({
      where: { id: subscriber.id },
      data: { status: 'SUSPENSO', suspendedUntil: null },
    });
    const res = await get('artigo-exclusivo', subscriber).expect(200);
    expect(res.body.paywalled).toBe(true);
  });
});

describe('Paywall disabled (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.FEATURE_READER_AREA = 'true';
    delete process.env.FEATURE_PAYWALL;
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await truncate(app, ['Comment', 'Reader', 'Article', 'Category', 'User']);
    await app.close();
  });

  it('serves an exclusive in full, exactly as before', async () => {
    // The flag is the way back. Off, marking an article exclusive
    // changes nothing that a reader can see.
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
        slug: 'artigo-exclusivo',
        title: 'Exclusivo',
        summary: 's',
        content: BODY,
        status: 'PUBLICADO',
        exclusive: true,
        publishedAt: new Date(),
        categoryId: cat.id,
        authorId: author.id,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/public/articles/by-slug/artigo-exclusivo')
      .expect(200);
    expect(res.body.content).toContain(SECRET);
    expect(res.body.paywalled).toBeUndefined();
  });
});
