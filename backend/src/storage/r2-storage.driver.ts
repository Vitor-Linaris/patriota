import { Logger } from '@nestjs/common';
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type { ByteRange, StorageDriver } from './storage.types';

export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  privateBucket: string;
  publicBucket: string;
}

/**
 * Sent with every object. The API sets its own headers when it proxies a
 * file, so this only matters once the public bucket is served straight
 * from a CDN domain — and there it is true for the same reason it is in
 * UploadsController: the name carries random bytes and the contents never
 * change under it.
 */
const PUBLIC_CACHE_CONTROL = 'public, max-age=2592000, immutable';

/**
 * Keys carry an `uploads/` prefix in both buckets. Once the public bucket
 * has its own domain the URL then still contains `/uploads/`, which is
 * what adminMediaUrl, mediaPreviewUrl and the cover picker in the admin
 * look for — so switching the public address changes nothing there.
 */
const keyFor = (rel: string) => `uploads/${rel}`;

function isNotFound(e: unknown): boolean {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    err.name === 'NotFound' ||
    err.name === 'NoSuchKey' ||
    err.$metadata?.httpStatusCode === 404
  );
}

/**
 * Cloudflare R2, through its S3-compatible API.
 *
 * Everything is written to the PRIVATE bucket, which has no public
 * access at all and is what the API reads from. `publish` copies an
 * object to the PUBLIC bucket — server-side, nothing is downloaded — and
 * that copy is the only way a file becomes fetchable without the API.
 */
export class R2StorageDriver implements StorageDriver {
  readonly id = 'r2' as const;
  private readonly logger = new Logger('Storage:r2');

  constructor(
    private readonly config: R2Config,
    private readonly client: S3Client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  ) {}

  async put(rel: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.privateBucket,
        Key: keyFor(rel),
        Body: body,
        ContentType: contentType,
        CacheControl: PUBLIC_CACHE_CONTROL,
      }),
    );
  }

  async head(rel: string): Promise<number | null> {
    try {
      const out = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.privateBucket,
          Key: keyFor(rel),
        }),
      );
      return out.ContentLength ?? null;
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async read(rel: string, range?: ByteRange): Promise<Readable> {
    const out = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.privateBucket,
        Key: keyFor(rel),
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      }),
    );
    // In Node the SDK's body is an http.IncomingMessage, a Readable.
    return out.Body as Readable;
  }

  async readBuffer(rel: string): Promise<Buffer> {
    const out = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.privateBucket,
        Key: keyFor(rel),
      }),
    );
    if (!out.Body) throw new Error(`Empty body for ${rel}`);
    return Buffer.from(await out.Body.transformToByteArray());
  }

  async delete(rels: string[]): Promise<void> {
    if (rels.length === 0) return;
    const objects = rels.map((rel) => ({ Key: keyFor(rel) }));
    for (const bucket of [
      this.config.privateBucket,
      this.config.publicBucket,
    ]) {
      try {
        const out = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
        for (const err of out.Errors ?? []) {
          this.logger.warn(
            `Could not delete ${err.Key} from ${bucket}: ${err.Message}`,
          );
        }
      } catch (e) {
        // Never worth failing a delete over — the row is already gone.
        // The file is an orphan, which costs storage, not a broken page.
        this.logger.warn(
          `Delete from ${bucket} failed: ${(e as Error).message}`,
        );
      }
    }
  }

  async publish(rels: string[]): Promise<void> {
    for (const rel of rels) {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.config.publicBucket,
          Key: keyFor(rel),
          CopySource: encodeURI(`${this.config.privateBucket}/${keyFor(rel)}`),
        }),
      );
    }
  }
}
