import { Logger } from '@nestjs/common';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type { ByteRange, StorageDriver } from './storage.types';

/**
 * The uploads directory on this machine — what the project has always
 * used, and still the default so a fresh clone and the e2e suite need
 * no credentials.
 *
 * `publish` is a no-op: there is one directory, and the API decides per
 * request whether a file may be handed out (UploadsController.mayServe).
 */
export class LocalStorageDriver implements StorageDriver {
  readonly id = 'local' as const;
  private readonly logger = new Logger('Storage:local');
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
    if (!existsSync(this.root)) mkdirSync(this.root, { recursive: true });
  }

  async put(rel: string, body: Buffer): Promise<void> {
    const target = this.resolve(rel);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async head(rel: string): Promise<number | null> {
    try {
      const info = await stat(this.resolve(rel));
      return info.isFile() ? info.size : null;
    } catch {
      return null;
    }
  }

  read(rel: string, range?: ByteRange): Promise<Readable> {
    const target = this.resolve(rel);
    return Promise.resolve(
      range
        ? createReadStream(target, { start: range.start, end: range.end })
        : createReadStream(target),
    );
  }

  readBuffer(rel: string): Promise<Buffer> {
    return readFile(this.resolve(rel));
  }

  async delete(rels: string[]): Promise<void> {
    for (const rel of rels) {
      try {
        await unlink(this.resolve(rel));
      } catch (e) {
        // ENOENT is the normal case for a file already gone; anything
        // else is worth knowing about but never worth failing a delete
        // over — the row is already committed.
        if ((e as { code?: string }).code !== 'ENOENT') {
          this.logger.warn(`Could not unlink ${rel}: ${(e as Error).message}`);
        }
      }
    }
  }

  publish(): Promise<void> {
    return Promise.resolve();
  }

  /** Belt and braces behind StorageService.isSafeRelative. */
  private resolve(rel: string): string {
    const target = resolve(join(this.root, rel));
    if (!target.startsWith(this.root + sep)) {
      throw new Error(`Path escapes the uploads directory: ${rel}`);
    }
    return target;
  }
}
