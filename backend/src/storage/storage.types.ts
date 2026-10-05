import type { Readable } from 'node:stream';

/** An inclusive byte range, as HTTP `Range: bytes=start-end` means it. */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Where uploaded files live. Paths are relative to the uploads root —
 * `2026/09/<hex>-large.webp`, `avatars/<id>-<hex>.webp` — and are the
 * same whichever driver is behind them, so nothing above this layer
 * knows or cares which one it is.
 *
 * Two places, not one: everything is written PRIVATE, and `publish`
 * makes a copy that the world may fetch directly. That is how "private
 * until something publishes it" (Media.visibility) survives a bucket
 * that cannot run our access check per request. On disk there is only
 * one place, and `publish` does nothing — the API still decides per
 * request, as it always has.
 */
export interface StorageDriver {
  readonly id: 'local' | 'r2';
  put(rel: string, body: Buffer, contentType: string): Promise<void>;
  /** Size in bytes, or null when there is no such file. */
  head(rel: string): Promise<number | null>;
  read(rel: string, range?: ByteRange): Promise<Readable>;
  readBuffer(rel: string): Promise<Buffer>;
  /** Removes from every place it may be. A missing file is not an error. */
  delete(rels: string[]): Promise<void>;
  /** Makes these files fetchable by anyone. Throws if any copy fails. */
  publish(rels: string[]): Promise<void>;
}
