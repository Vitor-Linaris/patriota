import { INestApplication } from '@nestjs/common';
import { existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import sharp from 'sharp';
import { createTestApp } from './helpers/app';
import { makeUser, bearer } from './helpers/auth';
import { truncate } from './helpers/db';
import { PrismaService } from '../src/prisma/prisma.service';
import { makeReader, readerBearer } from './helpers/reader';

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
    // Multer's limit is enforced before the body is buffered, and it is
    // the OUTER gate: 15 MB, the animation limit, not the 10 MB still
    // limit. It has to be the more generous of the two, or a 12 MB
    // animated GIF dies here before the service can apply the rule that
    // actually allows it. The per-kind limits are enforced below, in
    // 'what may be uploaded'.
    const huge = Buffer.alloc(16 * 1024 * 1024, 0);
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

  describe('what may be uploaded', () => {
    /** An animated GIF of `frames` frames, built by sharp. */
    async function makeAnimatedGif(frames: number): Promise<Buffer> {
      const w = 32;
      const h = 32;
      // One tall strip of `frames` pages, which is how sharp expresses
      // an animation on the way in.
      const strip = Buffer.concat(
        Array.from({ length: frames }, (_, i) =>
          Buffer.alloc(w * h * 3, (i * 40) % 255),
        ),
      );
      // `pageHeight` goes INSIDE `raw`, not beside it — beside it,
      // sharp silently treats the strip as one tall still and writes a
      // single-frame GIF, which would make this whole test vacuous.
      return sharp(strip, {
        raw: { width: w, height: h * frames, channels: 3, pageHeight: h },
      })
        .gif({ loop: 0 })
        .toBuffer();
    }

    it('keeps an animated GIF animated', async () => {
      // The defect this fixes. `sharp(buffer)` without `animated: true`
      // reads only the first frame, so every animation this project has
      // ever been given was silently flattened to a still — no error,
      // no warning, the uploader just lost the animation.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const gif = await makeAnimatedGif(6);

      const res = await request(app.getHttpServer())
        .post('/admin/media/upload')
        .set(bearer(user))
        .attach('file', gif, {
          filename: 'anim.gif',
          contentType: 'image/gif',
        })
        .expect(201);

      expect(res.body.frames).toBeGreaterThan(1);

      // And the file on disk really carries them — the count in the
      // database could be right while the encoder dropped them.
      const stored = await sharp(
        join(uploadsDir, res.body.url.replace('http://api.test/uploads/', '')),
        { animated: true },
      ).metadata();
      expect(stored.pages).toBeGreaterThan(1);
    });

    it('refuses an animation with too many frames, and says how many', async () => {
      // Not cosmetic: re-encoding a long animation to WebP can produce
      // something larger than it came from.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const gif = await makeAnimatedGif(320);

      const res = await request(app.getHttpServer())
        .post('/admin/media/upload')
        .set(bearer(user))
        .attach('file', gif, {
          filename: 'longo.gif',
          contentType: 'image/gif',
        })
        .expect(400);

      expect(res.body.message).toMatch(/320 fotogramas/);
      expect(res.body.message).toMatch(/300/);
    });

    it('judges the file by its bytes, not by what the request claims', async () => {
      // A zip renamed .png and sent as image/png passed the old
      // whitelist. sharp caught it a step later by accident; a video
      // would not pass through sharp at all.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const zip = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.alloc(256, 7),
      ]);

      const res = await request(app.getHttpServer())
        .post('/admin/media/upload')
        .set(bearer(user))
        .attach('file', zip, {
          filename: 'inocente.png',
          contentType: 'image/png',
        })
        .expect(400);

      expect(res.body.message).toMatch(/não suportado/i);
    });

    it('tells somebody uploading a video that it is a video', async () => {
      // Rather than "tipo não suportado", which does not say what to do.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const mp4 = Buffer.concat([
        Buffer.alloc(4, 0),
        Buffer.from('ftypisom', 'latin1'),
        Buffer.alloc(256, 0),
      ]);

      const res = await request(app.getHttpServer())
        .post('/admin/media/upload')
        .set(bearer(user))
        .attach('file', mp4, {
          filename: 'clip.mp4',
          contentType: 'image/png',
        })
        .expect(400);

      expect(res.body.message).toMatch(/vídeo/i);
    });
  });

  describe('video', () => {
    /**
     * A real MP4, made by ffmpeg itself.
     *
     * A handcrafted byte blob would pass the signature check and then
     * fail in ffprobe, which tests the wrong thing entirely — the point
     * here is the probe, the limits and the poster frame.
     */
    async function makeMp4(opts: {
      seconds?: number;
      width?: number;
      height?: number;
      codec?: string;
    } = {}): Promise<Buffer> {
      const {
        seconds = 2,
        width = 320,
        height = 240,
        codec = 'libx264',
      } = opts;
      const out = join(uploadsDir, `probe-${randomUUID()}.mp4`);
      await promisify(execFile)(
        'ffmpeg',
        [
          '-v', 'error',
          '-f', 'lavfi',
          '-i', `testsrc=size=${width}x${height}:rate=10:duration=${seconds}`,
          '-c:v', codec,
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-y', out,
        ],
        { timeout: 60_000 },
      );
      const buf = await readFile(out);
      rmSync(out, { force: true });
      return buf;
    }

    const post = (
      user: Awaited<ReturnType<typeof makeUser>>,
      video: Buffer,
      filename = 'clip.mp4',
    ) =>
      request(app.getHttpServer())
        .post('/admin/media/video')
        .set(bearer(user))
        .attach('file', video, { filename, contentType: 'video/mp4' });

    it('stores a video, reads it, and takes a thumbnail from it', async () => {
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const mp4 = await makeMp4({ seconds: 3, width: 320, height: 240 });

      const res = await post(user, mp4).expect(201);

      expect(res.body.kind).toBe('VIDEO');
      expect(res.body.mimeType).toBe('video/mp4');
      expect(res.body.width).toBe(320);
      expect(res.body.height).toBe(240);
      expect(res.body.durationSeconds).toBe(3);
      // The still, so the grid does not show a hole where a video is.
      expect(res.body.posterUrl).toMatch(/-poster\.webp$/);
      // Stored as it arrived: the URL keeps the real extension rather
      // than pretending to be a WebP.
      expect(res.body.url).toMatch(/-video\.mp4$/);
    });

    it('counts the video AND its thumbnail against the quota', async () => {
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const res = await post(user, await makeMp4()).expect(201);

      const row = await app
        .get(PrismaService)
        .media.findUnique({ where: { id: res.body.id } });
      expect(row!.bytesOnDisk).toBeGreaterThan(row!.size!);
    });

    it('refuses a video longer than the limit, with the length found', async () => {
      // "O limite é 5 minutos" alone tells somebody nothing about a
      // clip they believe is short.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const long = await makeMp4({ seconds: 301, width: 160, height: 120 });

      const res = await post(user, long).expect(400);
      expect(res.body.message).toMatch(/5m0[01]s/);
      expect(res.body.message).toMatch(/5 minutos/);
    });

    it('refuses a video bigger than 1080p, with the size found', async () => {
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const huge = await makeMp4({ seconds: 1, width: 2560, height: 1440 });

      const res = await post(huge ? user : user, huge).expect(400);
      expect(res.body.message).toMatch(/2560×1440/);
      expect(res.body.message).toMatch(/1080p/);
    });

    it('refuses a codec browsers will not play, and says what to export', async () => {
      // The failure that would otherwise be invisible: it uploads
      // happily and then simply does not play for a good share of
      // readers.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      let mpeg4: Buffer;
      try {
        mpeg4 = await makeMp4({ seconds: 1, codec: 'mpeg4' });
      } catch {
        return; // encoder not built into this ffmpeg — nothing to assert
      }

      const res = await post(user, mpeg4).expect(400);
      expect(res.body.message).toMatch(/mpeg4/);
      expect(res.body.message).toMatch(/H\.264/);
    });

    it('refuses an image sent to the video route, and vice versa', async () => {
      // Each route says what the file actually is rather than "tipo não
      // suportado", which does not tell anybody where to go instead.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });

      const wrongWay = await request(app.getHttpServer())
        .post('/admin/media/video')
        .set(bearer(user))
        .attach('file', await makePngBuffer(100, 100), {
          filename: 'foto.png',
          contentType: 'video/mp4',
        })
        .expect(400);
      expect(wrongWay.body.message).toMatch(/imagem/i);

      const otherWay = await request(app.getHttpServer())
        .post('/admin/media/upload')
        .set(bearer(user))
        .attach('file', await makeMp4({ seconds: 1 }), {
          filename: 'clip.mp4',
          contentType: 'image/png',
        })
        .expect(400);
      expect(otherWay.body.message).toMatch(/vídeo/i);
    });

    it('keeps video out of the list when asked for images only', async () => {
      // What the picker in the article editor asks for. It has to be
      // the server that filters: the picker fetches one page and stops,
      // so filtering afterwards would let video push images off the end
      // of a list that still looks complete. And both places the picker
      // feeds insert an <img>, so a video chosen there is a broken
      // picture on a published article.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      await post(user, await makeMp4()).expect(201);
      await request(app.getHttpServer())
        .post('/admin/media/upload')
        .set(bearer(user))
        .attach('file', await makePngBuffer(100, 100), {
          filename: 'foto.png',
          contentType: 'image/png',
        })
        .expect(201);

      const all = await request(app.getHttpServer())
        .get('/admin/media')
        .set(bearer(user))
        .expect(200);
      expect(all.body.total).toBe(2);

      const images = await request(app.getHttpServer())
        .get('/admin/media?kind=IMAGEM')
        .set(bearer(user))
        .expect(200);
      expect(images.body.total).toBe(1);
      expect(images.body.items[0].kind).toBe('IMAGEM');

      const videos = await request(app.getHttpServer())
        .get('/admin/media?kind=VIDEO')
        .set(bearer(user))
        .expect(200);
      expect(videos.body.total).toBe(1);
      expect(videos.body.items[0].kind).toBe('VIDEO');
    });

    it('a video is private until published, like everything else', async () => {
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const res = await post(user, await makeMp4()).expect(201);
      const path = res.body.url.replace('http://api.test/uploads/', '');

      await request(app.getHttpServer()).get(`/uploads/${path}`).expect(404);
      await request(app.getHttpServer())
        .get(`/uploads/${path}`)
        .set(bearer(user))
        .expect(200);
    });

    it('serves a byte range, which is what makes a video seekable', async () => {
      // Not a nicety. Without it a reader cannot seek at all, and
      // Safari refuses to start playing — it asks for a range first and
      // treats a plain 200 as a broken source.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const res = await post(user, await makeMp4()).expect(201);
      await app
        .get(PrismaService)
        .media.update({
          where: { id: res.body.id },
          data: { visibility: 'PUBLICO' },
        });
      const path = res.body.url.replace('http://api.test/uploads/', '');

      const full = await request(app.getHttpServer())
        .get(`/uploads/${path}`)
        .expect(200);
      expect(full.headers['accept-ranges']).toBe('bytes');
      expect(full.headers['content-type']).toBe('video/mp4');

      const part = await request(app.getHttpServer())
        .get(`/uploads/${path}`)
        .set('Range', 'bytes=0-99')
        .expect(206);
      expect(part.headers['content-range']).toMatch(/^bytes 0-99\//);
      expect(part.headers['content-length']).toBe('100');

      // A suffix range asks for the LAST n bytes, not the first.
      // Getting it backwards serves the wrong part with a 206, which
      // looks like corruption rather than an error.
      const tail = await request(app.getHttpServer())
        .get(`/uploads/${path}`)
        .set('Range', 'bytes=-50')
        .expect(206);
      const size = Number(full.headers['content-length']);
      expect(tail.headers['content-range']).toBe(
        `bytes ${size - 50}-${size - 1}/${size}`,
      );

      // Past the end is 416, with the real size so the client can ask
      // again sensibly.
      const bad = await request(app.getHttpServer())
        .get(`/uploads/${path}`)
        .set('Range', `bytes=${size + 10}-`)
        .expect(416);
      expect(bad.headers['content-range']).toBe(`bytes */${size}`);
    });
  });

  describe('the quota', () => {
    /** NOT async: the caller chains `.expect()`, which needs the
     *  supertest object rather than a promise wrapping it. */
    function upload(user: Awaited<ReturnType<typeof makeUser>>, png: Buffer) {
      return request(app.getHttpServer())
        .post('/admin/media/upload')
        .set(bearer(user))
        .attach('file', png, { filename: 'q.png', contentType: 'image/png' });
    }

    it('counts all three variants, not just the one it shows a size for', async () => {
      // `size` is the large variant — what the library displays and
      // what somebody would download. Counting only that would miss the
      // small and medium files: about a third of the disk, invisible.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const png = await makePngBuffer(800, 600);
      const res = await upload(user, png).expect(201);

      const row = await app
        .get(PrismaService)
        .media.findUnique({ where: { id: res.body.id } });
      expect(row!.bytesOnDisk).toBeGreaterThan(row!.size!);
    });

    it('reports what is used and what is left', async () => {
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const png = await makePngBuffer(800, 600);
      await upload(user, png).expect(201);

      const list = await request(app.getHttpServer())
        .get('/admin/media')
        .set(bearer(user))
        .expect(200);

      expect(list.body.quota.used).toBeGreaterThan(0);
      expect(list.body.quota.limit).toBe(2 * 1024 * 1024 * 1024);
      expect(list.body.quota.remaining).toBe(
        list.body.quota.limit - list.body.quota.used,
      );
    });

    it('is per person — one library filling up does not touch another', async () => {
      const ana = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const png = await makePngBuffer(800, 600);
      const bruno = await makeUser(app, { role: 'EDITOR_CHEFE' });
      await upload(ana, png).expect(201);

      const hers = await request(app.getHttpServer())
        .get('/admin/media')
        .set(bearer(ana))
        .expect(200);
      const his = await request(app.getHttpServer())
        .get('/admin/media')
        .set(bearer(bruno))
        .expect(200);

      expect(hers.body.quota.used).toBeGreaterThan(0);
      expect(his.body.quota.used).toBe(0);
    });

    it('refuses when there is no room, and says the numbers', async () => {
      // "Sem espaço" on its own is not actionable. The message carries
      // what is used and what the allowance is, so somebody knows
      // whether to delete one file or fifty.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const png = await makePngBuffer(800, 600);
      const first = await upload(user, png).expect(201);

      // Push the recorded usage right up to the limit rather than
      // uploading two gigabytes.
      //
      // 2147483647 and not 2 GB exactly: `bytesOnDisk` is an Int, and
      // 2 GB is one past what a 32-bit signed integer holds. That is
      // fine for the column — a single file is capped at 100 MB and
      // will never come close — and Postgres sums Ints into a bigint,
      // so the total is not at risk either. It only bites here, where a
      // test wants one row to stand in for a whole full library.
      await app.get(PrismaService).media.update({
        where: { id: first.body.id },
        data: { bytesOnDisk: 2_147_483_647 },
      });

      const res = await upload(user, png).expect(409);
      expect(res.body.message).toMatch(/sem espaço/i);
      expect(res.body.message).toMatch(/2\.0 GB/);
    });

    it('frees the space again when a file is deleted', async () => {
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const png = await makePngBuffer(800, 600);
      const res = await upload(user, png).expect(201);

      await request(app.getHttpServer())
        .delete(`/admin/media/${res.body.id}`)
        .set(bearer(user))
        .expect(200);

      const list = await request(app.getHttpServer())
        .get('/admin/media')
        .set(bearer(user))
        .expect(200);
      expect(list.body.quota.used).toBe(0);
    });
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

  describe('serving files', () => {
    /** The path part of an uploads URL, as the route receives it. */
    const pathOf = (url: string) =>
      url.replace('http://api.test/uploads/', '');

    async function uploadAs(user: Awaited<ReturnType<typeof makeUser>>) {
      const png = await makePngBuffer(400, 300);
      const res = await request(app.getHttpServer())
        .post('/admin/media/upload')
        .set(bearer(user))
        .attach('file', png, { filename: 'foto.png', contentType: 'image/png' })
        .expect(201);
      return res.body as { id: string; url: string };
    }

    const publish = async (id: string) =>
      app
        .get(PrismaService)
        .media.update({ where: { id }, data: { visibility: 'PUBLICO' } });

    it('serves published media to a complete stranger', async () => {
      // The assertion the whole feature is balanced on. A reader with
      // no session, Googlebot and the robot that builds a link preview
      // all arrive exactly like this.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const media = await uploadAs(user);
      await publish(media.id);

      const res = await request(app.getHttpServer())
        .get(`/uploads/${pathOf(media.url)}`)
        .expect(200);

      expect(res.headers['content-type']).toBe('image/webp');
      // Same caching the static handler used to send, so nothing that
      // already holds one of these notices the change.
      expect(res.headers['cache-control']).toMatch(/immutable/);
      expect(res.headers['cache-control']).toMatch(/max-age=2592000/);
    });

    it('hides unpublished media from a stranger', async () => {
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const media = await uploadAs(user);

      // 404 and not 403: a 403 would confirm the file is there, which
      // turns this route into a way to probe for unpublished material.
      await request(app.getHttpServer())
        .get(`/uploads/${pathOf(media.url)}`)
        .expect(404);
    });

    it('shows unpublished media to its owner and to a SUPER_ADMIN', async () => {
      const owner = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const boss = await makeUser(app, { role: 'SUPER_ADMIN' });
      const media = await uploadAs(owner);

      await request(app.getHttpServer())
        .get(`/uploads/${pathOf(media.url)}`)
        .set(bearer(owner))
        .expect(200);

      await request(app.getHttpServer())
        .get(`/uploads/${pathOf(media.url)}`)
        .set(bearer(boss))
        .expect(200);
    });

    it('hides one person\'s unpublished media from another', async () => {
      const owner = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const other = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const media = await uploadAs(owner);

      await request(app.getHttpServer())
        .get(`/uploads/${pathOf(media.url)}`)
        .set(bearer(other))
        .expect(404);
    });

    it('heals a missed promotion instead of breaking a live page', async () => {
      // A publish path nobody thought of, a database blip. The
      // consequence would be a broken image on a published article,
      // which readers see and nobody gets told about — so before
      // refusing, the route asks the articles directly.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const media = await uploadAs(user);
      const prisma = app.get(PrismaService);

      const cat = await prisma.category.create({
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
      // Written straight to the database, so no promotion ever ran.
      await prisma.article.create({
        data: {
          slug: 'ja-no-ar',
          title: 'Já no ar',
          summary: 's',
          content: 'c',
          status: 'PUBLICADO',
          publishedAt: new Date(),
          coverImageUrl: media.url,
          categoryId: cat.id,
          authorId: user.id,
        },
      });
      expect(
        (await prisma.media.findUnique({ where: { id: media.id } }))!
          .visibility,
      ).toBe('PRIVADO');

      await request(app.getHttpServer())
        .get(`/uploads/${pathOf(media.url)}`)
        .expect(200);

      // And it corrected itself, so the next request takes the fast path.
      expect(
        (await prisma.media.findUnique({ where: { id: media.id } }))!
          .visibility,
      ).toBe('PUBLICO');
    });

    it('does not heal for a DRAFT article', async () => {
      // The self-heal must only rescue what is actually live, or it
      // becomes a way to read any image by referencing it from a draft.
      const user = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const media = await uploadAs(user);
      const prisma = app.get(PrismaService);
      const cat = await prisma.category.create({
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
      await prisma.article.create({
        data: {
          slug: 'so-rascunho',
          title: 'Só rascunho',
          summary: 's',
          content: 'c',
          status: 'RASCUNHO',
          coverImageUrl: media.url,
          categoryId: cat.id,
          authorId: user.id,
        },
      });

      await request(app.getHttpServer())
        .get(`/uploads/${pathOf(media.url)}`)
        .expect(404);
    });

    it('refuses to climb out of the uploads directory', async () => {
      await request(app.getHttpServer())
        .get('/uploads/../../etc/passwd')
        .expect(404);
      await request(app.getHttpServer())
        .get('/uploads/2026/09/../../../package.json')
        .expect(404);
    });

    it('will not take a reader token for a staff one', async () => {
      // Both are JWTs. They are signed with different secrets AND
      // stamped with an audience, and this route reproduces the guard's
      // check rather than just verifying a signature.
      const owner = await makeUser(app, { role: 'EDITOR_CHEFE' });
      const media = await uploadAs(owner);
      const reader = await makeReader(app);

      await request(app.getHttpServer())
        .get(`/uploads/${pathOf(media.url)}`)
        .set(readerBearer(reader))
        .expect(404);
    });

    it('404s a path that nothing in the database claims', async () => {
      await request(app.getHttpServer())
        .get('/uploads/2026/09/deadbeefdeadbeef-large.webp')
        .expect(404);
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
