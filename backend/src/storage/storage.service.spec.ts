import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorageService } from './storage.service';

const R2_VARS = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_PRIVATE',
  'R2_BUCKET_PUBLIC',
];

describe('StorageService', () => {
  const saved = { ...process.env };
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'patriota-storage-'));
    process.env.UPLOADS_DIR = dir;
    process.env.UPLOADS_PUBLIC_BASE_URL = 'https://api.opatriota.pt/uploads/';
    delete process.env.STORAGE_DRIVER;
    for (const v of R2_VARS) delete process.env[v];
  });

  afterEach(() => {
    process.env = { ...saved };
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses the local directory by default', () => {
    expect(new StorageService().driverId).toBe('local');
  });

  it('refuses to boot with STORAGE_DRIVER=r2 and credentials missing', () => {
    // A store that cannot write fails every upload; better the deploy
    // stops than a journalist finds out on deadline.
    process.env.STORAGE_DRIVER = 'r2';
    process.env.R2_ENDPOINT = 'https://x.r2.cloudflarestorage.com';

    expect(() => new StorageService()).toThrow(
      /R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_PRIVATE, R2_BUCKET_PUBLIC/,
    );
  });

  it('boots the R2 driver when everything is set', () => {
    process.env.STORAGE_DRIVER = 'r2';
    for (const v of R2_VARS) process.env[v] = 'x';

    expect(new StorageService().driverId).toBe('r2');
  });

  it('builds URLs under the public base, whatever its trailing slash', () => {
    expect(new StorageService().urlFor('2026/09/abc-large.webp')).toBe(
      'https://api.opatriota.pt/uploads/2026/09/abc-large.webp',
    );
  });

  describe('relativeFromUrl', () => {
    const svc = () => new StorageService();

    it('reads the path back out of one of our URLs', () => {
      expect(
        svc().relativeFromUrl(
          'https://api.opatriota.pt/uploads/2026/09/abc-large.webp',
        ),
      ).toBe('2026/09/abc-large.webp');
    });

    it('ignores a query string or fragment', () => {
      expect(
        svc().relativeFromUrl(
          'https://api.opatriota.pt/uploads/avatars/u-1.webp?v=2',
        ),
      ).toBe('avatars/u-1.webp');
    });

    it('is null for an address that is not ours', () => {
      expect(
        svc().relativeFromUrl('https://cdn.example/uploads/2026/09/a.webp'),
      ).toBeNull();
      // Same prefix, different host path — must not be mistaken for ours.
      expect(
        svc().relativeFromUrl(
          'https://api.opatriota.pt/uploads-old/2026/09/a.webp',
        ),
      ).toBeNull();
    });

    it('is null for anything that climbs out of the uploads root', () => {
      expect(
        svc().relativeFromUrl(
          'https://api.opatriota.pt/uploads/../../etc/passwd',
        ),
      ).toBeNull();
    });
  });

  it('refuses an unsafe path on every operation', async () => {
    const svc = new StorageService();
    await expect(svc.readBuffer('../secret')).rejects.toThrow(/Unsafe/);
    await expect(
      svc.put('/abs.webp', Buffer.from('x'), 'image/webp'),
    ).rejects.toThrow(/Unsafe/);
  });

  it('round-trips a file through the local driver', async () => {
    const svc = new StorageService();
    await svc.put('2026/09/abc-large.webp', Buffer.from('hello'), 'image/webp');

    await expect(svc.head('2026/09/abc-large.webp')).resolves.toBe(5);
    await expect(svc.readBuffer('2026/09/abc-large.webp')).resolves.toEqual(
      Buffer.from('hello'),
    );

    await svc.delete(['2026/09/abc-large.webp', '2026/09/never-was.webp']);
    await expect(svc.head('2026/09/abc-large.webp')).resolves.toBeNull();
  });
});
