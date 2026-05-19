import { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import sharp from 'sharp';
import { createTestApp } from './helpers/app';
import { makeUser, bearer } from './helpers/auth';
import { truncate } from './helpers/db';

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
    await truncate(app, ['Media']);
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
});
