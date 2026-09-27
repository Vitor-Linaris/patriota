import { Injectable, Logger } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { LocalStorageDriver } from './local-storage.driver';
import { R2StorageDriver, type R2Config } from './r2-storage.driver';
import type { ByteRange, StorageDriver } from './storage.types';

const R2_ENV = {
  endpoint: 'R2_ENDPOINT',
  accessKeyId: 'R2_ACCESS_KEY_ID',
  secretAccessKey: 'R2_SECRET_ACCESS_KEY',
  privateBucket: 'R2_BUCKET_PRIVATE',
  publicBucket: 'R2_BUCKET_PUBLIC',
} as const satisfies Record<keyof R2Config, string>;

/**
 * Where uploads are written and read from, and how their URLs are made.
 *
 * STORAGE_DRIVER=local (default) or r2. Credentials come from the
 * environment and never from a Setting row — the same rule as the mail
 * provider (MailerService.status): GET /admin/settings hands that JSON
 * to anyone with `configuracoes.aceder`.
 *
 * Unlike e-mail, a storage driver that is asked for and not configured
 * stops the boot. A mailer that cannot send degrades to a log line; a
 * store that cannot write fails every upload, and the first person to
 * find out would be a journalist on deadline.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;
  private readonly publicBase: string;

  constructor() {
    this.publicBase = (
      process.env.UPLOADS_PUBLIC_BASE_URL ?? 'http://localhost:8585/uploads'
    ).replace(/\/+$/, '');

    if (process.env.STORAGE_DRIVER === 'r2') {
      const missing = Object.values(R2_ENV).filter((k) => !process.env[k]);
      if (missing.length > 0) {
        throw new Error(
          `STORAGE_DRIVER=r2 but ${missing.join(', ')} ${
            missing.length === 1 ? 'is' : 'are'
          } not set.`,
        );
      }
      const config = Object.fromEntries(
        Object.entries(R2_ENV).map(([field, env]) => [field, process.env[env]]),
      ) as unknown as R2Config;
      this.driver = new R2StorageDriver(config);
    } else {
      this.driver = new LocalStorageDriver(
        process.env.UPLOADS_DIR ?? '/usr/src/app/uploads',
      );
    }
    this.logger.log(`Uploads stored with the "${this.driver.id}" driver.`);
  }

  get driverId(): StorageDriver['id'] {
    return this.driver.id;
  }

  /** The address stored in the database for a file at `rel`. */
  urlFor(rel: string): string {
    return `${this.publicBase}/${rel}`;
  }

  /**
   * The storage path behind one of our URLs, or null.
   *
   * Null for anything that is not ours — the paste-a-link path stores
   * whatever address it was given — and for anything that would climb
   * out of the uploads root, which no URL we generate can produce but
   * which is not worth trusting.
   */
  relativeFromUrl(url: string): string | null {
    if (!url.startsWith(this.publicBase + '/')) return null;
    const rel = url.slice(this.publicBase.length + 1).split(/[?#]/)[0];
    return StorageService.isSafeRelative(rel) ? rel : null;
  }

  static isSafeRelative(rel: string): boolean {
    if (!rel || rel.includes('\0') || rel.includes('\\')) return false;
    if (rel.startsWith('/')) return false;
    return rel
      .split('/')
      .every((seg) => seg !== '' && seg !== '.' && seg !== '..');
  }

  // async throughout, so an unsafe path is a rejected promise like every
  // other storage failure rather than a synchronous throw.
  async put(rel: string, body: Buffer, contentType: string): Promise<void> {
    return this.driver.put(this.checked(rel), body, contentType);
  }

  async head(rel: string): Promise<number | null> {
    return this.driver.head(this.checked(rel));
  }

  async read(rel: string, range?: ByteRange): Promise<Readable> {
    return this.driver.read(this.checked(rel), range);
  }

  async readBuffer(rel: string): Promise<Buffer> {
    return this.driver.readBuffer(this.checked(rel));
  }

  async delete(rels: string[]): Promise<void> {
    return this.driver.delete(rels.map((r) => this.checked(r)));
  }

  async publish(rels: string[]): Promise<void> {
    return this.driver.publish(rels.map((r) => this.checked(r)));
  }

  private checked(rel: string): string {
    if (!StorageService.isSafeRelative(rel)) {
      throw new Error(`Unsafe storage path: ${rel}`);
    }
    return rel;
  }
}
