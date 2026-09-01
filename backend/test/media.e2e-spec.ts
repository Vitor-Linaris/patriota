import { INestApplication } from '@nestjs/common';
import { existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import sharp from 'sharp';
import { createTestApp } from './helpers/app';
import { makeUser, bearer } from './helpers/auth';
import { truncate } from './helpers/db';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Media uploads (e2e)', () => {
  let app: INestApplication;
  let uploadsDir: string;
  const ORIGINAL_UPLOADS_DIR = process.env.UPLOADS_DIR;
  const ORIGINAL_PUBLIC_BASE = process.env.UPLOADS_PUBLIC_BASE_URL;

  beforeAll(async () => {
    // Isolate uploads to a tmp dir per test run so the suite never
    // pollutes the dev volume.
    uploadsDir = mkdtempSync(join(tmpdir(), 'patriota-uploads-'));
    process.env.UPLOADS_DIR = uploadsDir;
    process.env.UPLOADS_PUBLIC_BASE_URL = 'http://api.test/uploads';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    rmSync(uploadsDir, { recursive: true, force: true });
    if (ORIGINAL_UPLOADS_DIR !== undefined) {
      process.env.UPLOADS_DIR = ORIGINAL_UPLOADS_DIR;
    } else {
      delete process.env.UPLOADS_DIR;
    }
    if (ORIGINAL_PUBLIC_BASE !== undefined) {
      process.env.UPLOADS_PUBLIC_BASE_URL = ORIGINAL_PUBLIC_BASE;
    } else {
      delete process.env.UPLOADS_PUBLIC_BASE_URL;
    }
  });

  beforeEach(async () => {
    await truncate(app, ['Article', 'Category', 'Media', 'User']);
  });

  async function makePngBuffer(width = 1200, height = 800): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 50, g: 120, b: 220 },
      },
    })
      .png()
      .toBuffer();
  }

  it('POST /admin/media/upload generates 3 WebP variants and persists URLs', async () => {
    const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const png = await makePngBuffer(1200, 800);

    const res = await request(app.getHttpServer())
      .post('/admin/media/upload')
      .set(bearer(user))
      .attach('file', png, { filename: 'photo.png', contentType: 'image/png' })
      .expect(201);

    expect(res.body.url).toMatch(/-large\.webp$/);
    expect(res.body.urlMedium).toMatch(/-medium\.webp$/);
    expect(res.body.urlSmall).toMatch(/-small\.webp$/);
    expect(res.body.mimeType).toBe('image/webp');
    expect(res.body.width).toBe(1200);
    expect(res.body.height).toBe(800);

    // The three files should physically exist on disk.
    const months = readdirSync(uploadsDir);
    expect(months.length).toBeGreaterThan(0);
  });

  it('rejects unsupported mime types with 4xx', async () => {
    const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
    await request(app.getHttpServer())
      .post('/admin/media/upload')
      .set(bearer(user))
      .attach(
        'file',
        Buffer.from('not an image'),
        { filename: 'note.txt', contentType: 'text/plain' },
      )
      .expect((res) => {
        // ParseFilePipe returns 422 by default in newer Nest; accept any 4xx.
        if (res.status < 400 || res.status >= 500) {
          throw new Error(`Expected 4xx, got ${res.status}`);
        }
      });
  });

  it('rejects oversized uploads with 413 and a friendly Portuguese message', async () => {
    const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
    // Multer's limit is enforced before the body is buffered. We send
    // a payload definitely bigger than the cap (MEDIA_MAX_UPLOAD_BYTES
    // defaults to 10 MB) — 11 MB of zeros is enough.
    const huge = Buffer.alloc(11 * 1024 * 1024, 0);
    const res = await request(app.getHttpServer())
      .post('/admin/media/upload')
      .set(bearer(user))
      .attach('file', huge, {
        filename: 'huge.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/demasiado grande/i);
  });

  it('answers 400, not 500, for a file whose header parses but whose data does not', async () => {
    // A truncated download or a half-written export. The header is a
    // real PNG signature so `metadata()` accepts it; the pixel data is
    // rubbish and only blows up in the resize loop — which used to give
    // the uploader "erro interno do servidor" about their own bad file.
    const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
    const real = await makePngBuffer(100, 100);
    const truncated = real.subarray(0, 60);

    // The uploads dir accumulates across the whole spec — only the
    // database is truncated between tests — so count the difference
    // rather than the total.
    const webpCount = () =>
      (readdirSync(uploadsDir, { recursive: true }) as string[]).filter((f) =>
        String(f).endsWith('.webp'),
      ).length;
    const before = webpCount();

    const res = await request(app.getHttpServer())
      .post('/admin/media/upload')
      .set(bearer(user))
      .attach('file', truncated, {
        filename: 'partido.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    // And the variants that were written before it failed are cleaned
    // up: files no row points at are invisible for ever and would count
    // against a quota nobody could explain.
    expect(webpCount()).toBe(before);
  });

  it('rejects unauthenticated upload with 401', async () => {
    const png = await makePngBuffer(100, 100);
    await request(app.getHttpServer())
      .post('/admin/media/upload')
      .attach('file', png, { filename: 'p.png', contentType: 'image/png' })
      .expect(401);
  });

  it('does not enlarge images smaller than the large target', async () => {
    const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
    // 200×200 < 400 (small target); withoutEnlargement should keep size
    const small = await makePngBuffer(200, 200);
    const res = await request(app.getHttpServer())
      .post('/admin/media/upload')
      .set(bearer(user))
      .attach('file', small, { filename: 's.png', contentType: 'image/png' })
      .expect(201);
    expect(res.body.width).toBe(200);
    expect(res.body.height).toBe(200);
  });

  describe('the library is per person', () => {
    async function uploadAs(
      user: Awaited<ReturnType<typeof makeUser>>,
      filename: string,
    ) {
      const png = await makePngBuffer(300, 200);
      const res = await request(app.getHttpServer())
        .post('/admin/media/upload')
        .set(bearer(user))
        .attach('file', png, { filename, contentType: 'image/png' })
        .expect(201);
      return res.body.id as string;
    }

    const listAs = (
      user: Awaited<ReturnType<typeof makeUser>>,
      qs = '',
    ) =>
      request(app.getHttpServer())
        .get(`/admin/media${qs}`)
        .set(bearer(user));

    it('each person sees only what they uploaded', async () => {
      // The whole point. Until now `list()` had no user filter at all
      // and everybody saw everybody's.
      const ana = await makeUser(app, { role: 'JORNALISTA' });
      const bruno = await makeUser(app, { role: 'EDITOR' });
      await uploadAs(ana, 'da-ana.png');
      await uploadAs(bruno, 'do-bruno.png');

      const mine = await listAs(ana).expect(200);
      expect(mine.body.total).toBe(1);
      expect(mine.body.items[0].name).toBe('da-ana');

      const theirs = await listAs(bruno).expect(200);
      expect(theirs.body.total).toBe(1);
      expect(theirs.body.items[0].name).toBe('do-bruno');
    });

    it('the search only searches your own library', async () => {
      // A filter that reached past the scope would be a way to confirm
      // what other people have, one filename at a time.
      const ana = await makeUser(app, { role: 'JORNALISTA' });
      const bruno = await makeUser(app, { role: 'EDITOR' });
      await uploadAs(bruno, 'segredo.png');

      const res = await listAs(ana, '?q=segredo').expect(200);
      expect(res.body.total).toBe(0);
    });

    it('a SUPER_ADMIN can ask for everything, with the owner attached', async () => {
      // Without this, files belonging to staff who have left would be
      // unreachable for ever and no one could answer "where did that
      // photo go".
      const ana = await makeUser(app, { role: 'JORNALISTA', name: 'Ana' });
      const boss = await makeUser(app, { role: 'SUPER_ADMIN' });
      await uploadAs(ana, 'da-ana.png');

      const own = await listAs(boss).expect(200);
      expect(own.body.total).toBe(0);

      const all = await listAs(boss, '?scope=todas').expect(200);
      expect(all.body.total).toBe(1);
      expect(all.body.items[0].uploadedBy.name).toBe('Ana');
    });

    it('refuses scope=todas to anybody else, rather than quietly narrowing', async () => {
      // Silently returning their own library would look like the filter
      // worked and showed nothing — a filter that does something else
      // is worse than one that refuses.
      const chief = await makeUser(app, { role: 'EDITOR_CHEFE' });
      await listAs(chief, '?scope=todas').expect(403);
    });

    it('never leaks the owner password hash', async () => {
      // The relation is selected explicitly. An `include` on User would
      // bring the whole row, hash and all.
      const ana = await makeUser(app, { role: 'JORNALISTA' });
      await uploadAs(ana, 'da-ana.png');

      const res = await listAs(ana).expect(200);
      const owner = res.body.items[0].uploadedBy;
      expect(Object.keys(owner).sort()).toEqual(['id', 'name']);
    });

    it('still counts usage across everybody, not just your own articles', async () => {
      // Deliberately NOT scoped. An image embedded in somebody else's
      // article has to read as in-use, or its owner deletes it and
      // breaks a page they cannot even see.
      // Ana is an EDITOR_CHEFE here only because the delete assertion at
      // the end needs `media.eliminar`; a JORNALISTA would be stopped by
      // the permission guard at 403 and never reach the in-use check
      // this test is about.
      const ana = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const bruno = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const id = await uploadAs(ana, 'capa.png');

      const listed = await listAs(ana).expect(200);
      const url = listed.body.items[0].url as string;

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
          path: '/root/',
        },
      });
      await prisma.article.create({
        data: {
          slug: 'artigo-do-bruno',
          title: 'Artigo do Bruno',
          summary: 's',
          content: 'c',
          status: 'PUBLICADO',
          publishedAt: new Date(),
          coverImageUrl: url,
          categoryId: cat.id,
          authorId: bruno.id,
        },
      });

      const after = await listAs(ana).expect(200);
      expect(after.body.items[0].articleCount).toBe(1);

      // And she cannot delete it out from under him.
      await request(app.getHttpServer())
        .delete(`/admin/media/${id}`)
        .set(bearer(ana))
        .expect(409);

      await truncate(app, ['Article', 'Category', 'Media']);
    });
  });

  describe('private until published', () => {
    async function uploadAs(user: Awaited<ReturnType<typeof makeUser>>) {
      const png = await makePngBuffer(500, 400);
      const res = await request(app.getHttpServer())
        .post('/admin/media/upload')
        .set(bearer(user))
        .attach('file', png, { filename: 'foto.png', contentType: 'image/png' })
        .expect(201);
      return res.body as {
        id: string;
        url: string;
        urlMedium: string;
        urlSmall: string;
      };
    }

    const visibilityOf = async (id: string) =>
      (await app.get(PrismaService).media.findUnique({ where: { id } }))
        ?.visibility;

    async function makeCategory() {
      return app.get(PrismaService).category.create({
        data: {
          slug: `cat-${Math.random().toString(36).slice(2, 8)}`,
          name: 'Sociedade',
          description: 'd',
          icon: '◆',
          color: '#1e40af',
          order: 1,
          visible: true,
          path: '/root/',
        },
      });
    }

    it('a fresh upload is private and carries a storage key', async () => {
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const media = await uploadAs(user);

      const row = await app
        .get(PrismaService)
        .media.findUnique({ where: { id: media.id } });
      expect(row!.visibility).toBe('PRIVADO');
      // The key ties the three variants together and is what the
      // serving route will look a file up by.
      expect(row!.storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f]+$/);
      expect(media.url).toContain(row!.storageKey!);
    });

    it('publishing an article publishes its cover', async () => {
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const media = await uploadAs(user);
      const cat = await makeCategory();

      const draft = await app.get(PrismaService).article.create({
        data: {
          slug: 'rascunho',
          title: 'Rascunho',
          summary: 's',
          content: 'c',
          status: 'RASCUNHO',
          coverImageUrl: media.url,
          categoryId: cat.id,
          authorId: user.id,
        },
      });
      // Still a draft — the photograph has not run anywhere.
      expect(await visibilityOf(media.id)).toBe('PRIVADO');

      await request(app.getHttpServer())
        .post(`/admin/articles/${draft.id}/publish`)
        .set(bearer(user))
        .expect(201);

      expect(await visibilityOf(media.id)).toBe('PUBLICO');
    });

    it('publishes images embedded in the body, not just the cover', async () => {
      // Inline images are inside the HTML, so they are found by the
      // address wherever it appears rather than by parsing the markup.
      // Missing one means a broken image on a live page.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const inline = await uploadAs(user);
      const cat = await makeCategory();

      const draft = await app.get(PrismaService).article.create({
        data: {
          slug: 'com-imagem',
          title: 'Com imagem',
          summary: 's',
          content: `<p>texto</p><img src="${inline.urlMedium}" /><p>mais</p>`,
          status: 'RASCUNHO',
          categoryId: cat.id,
          authorId: user.id,
        },
      });

      await request(app.getHttpServer())
        .post(`/admin/articles/${draft.id}/publish`)
        .set(bearer(user))
        .expect(201);

      expect(await visibilityOf(inline.id)).toBe('PUBLICO');
    });

    it('swapping the cover of a live article publishes the new image', async () => {
      // Otherwise the change goes out with a broken image on it.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const first = await uploadAs(user);
      const second = await uploadAs(user);
      const cat = await makeCategory();

      const live = await app.get(PrismaService).article.create({
        data: {
          slug: 'no-ar',
          title: 'No ar',
          summary: 's',
          content: 'c',
          status: 'PUBLICADO',
          publishedAt: new Date(),
          coverImageUrl: first.url,
          categoryId: cat.id,
          authorId: user.id,
        },
      });

      await request(app.getHttpServer())
        .patch(`/admin/articles/${live.id}`)
        .set(bearer(user))
        .send({ coverImageUrl: second.url })
        .expect(200);

      expect(await visibilityOf(second.id)).toBe('PUBLICO');
    });

    it('editing a DRAFT leaves its images private', async () => {
      // The whole point of the feature: work in progress stays out of
      // reach until it runs.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const media = await uploadAs(user);
      const cat = await makeCategory();

      const draft = await app.get(PrismaService).article.create({
        data: {
          slug: 'ainda-rascunho',
          title: 'Ainda rascunho',
          summary: 's',
          content: 'c',
          status: 'RASCUNHO',
          categoryId: cat.id,
          authorId: user.id,
        },
      });

      await request(app.getHttpServer())
        .patch(`/admin/articles/${draft.id}`)
        .set(bearer(user))
        .send({ coverImageUrl: media.url })
        .expect(200);

      expect(await visibilityOf(media.id)).toBe('PRIVADO');
    });

    it('unpublishing does NOT make the images private again', async () => {
      // One-way on purpose. The address has been in the wild — in an
      // RSS reader, a Facebook cache, somebody's open tab. Flipping the
      // column back would be a promise we cannot keep.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const media = await uploadAs(user);
      const cat = await makeCategory();

      const draft = await app.get(PrismaService).article.create({
        data: {
          slug: 'ida-e-volta',
          title: 'Ida e volta',
          summary: 's',
          content: 'c',
          status: 'RASCUNHO',
          coverImageUrl: media.url,
          categoryId: cat.id,
          authorId: user.id,
        },
      });
      await request(app.getHttpServer())
        .post(`/admin/articles/${draft.id}/publish`)
        .set(bearer(user))
        .expect(201);
      expect(await visibilityOf(media.id)).toBe('PUBLICO');

      await request(app.getHttpServer())
        .post(`/admin/articles/${draft.id}/archive`)
        .set(bearer(user))
        .expect(201);

      expect(await visibilityOf(media.id)).toBe('PUBLICO');
    });
  });

  describe('deleting', () => {
    /** Uploads one image and returns its row plus the paths on disk. */
    async function upload(user: Awaited<ReturnType<typeof makeUser>>) {
      const png = await makePngBuffer(600, 400);
      const res = await request(app.getHttpServer())
        .post('/admin/media/upload')
        .set(bearer(user))
        .attach('file', png, { filename: 'x.png', contentType: 'image/png' })
        .expect(201);

      const paths = [res.body.url, res.body.urlMedium, res.body.urlSmall].map(
        (u: string) =>
          join(uploadsDir, u.replace('http://api.test/uploads/', '')),
      );
      return { id: res.body.id as string, paths };
    }

    it('removes the files from disk, not just the row', async () => {
      // Deleting used to drop the row and leave all three WebP variants
      // behind for ever. Nobody noticed because they are small — but a
      // per-person quota is about to count them, and a video is 100 MB.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const { id, paths } = await upload(user);
      for (const p of paths) expect(existsSync(p)).toBe(true);

      await request(app.getHttpServer())
        .delete(`/admin/media/${id}`)
        .set(bearer(user))
        .expect(200);

      for (const p of paths) expect(existsSync(p)).toBe(false);
    });

    it('refuses to delete somebody else\'s media, and leaves the files alone', async () => {
      const owner = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const other = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const { id, paths } = await upload(owner);

      // 404, not 403: a 403 would confirm the id is real, which is a
      // way to enumerate a library you cannot see.
      await request(app.getHttpServer())
        .delete(`/admin/media/${id}`)
        .set(bearer(other))
        .expect(404);

      for (const p of paths) expect(existsSync(p)).toBe(true);
    });

    it('lets a SUPER_ADMIN delete what is not theirs', async () => {
      // Somebody has to be able to clear out the files of staff who
      // have left, or they are permanent.
      const owner = await makeUser(app, { role: 'JORNALISTA' });
      const boss = await makeUser(app, { role: 'SUPER_ADMIN' });
      const { id, paths } = await upload(owner);

      await request(app.getHttpServer())
        .delete(`/admin/media/${id}`)
        .set(bearer(boss))
        .expect(200);

      for (const p of paths) expect(existsSync(p)).toBe(false);
    });
  });
});
