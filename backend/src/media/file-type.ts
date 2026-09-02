/**
 * What a file actually is, decided by its bytes.
 *
 * The multipart `Content-Type` is whatever the client chose to write in
 * the request — it is a claim, not a fact. Until now `uploadFile()`
 * checked that claim against a whitelist and nothing else. For images
 * that was survivable by accident: sharp refuses to decode something
 * that is not an image, so a renamed zip failed a step later. Video
 * will not pass through sharp at all, so the claim would be the only
 * thing standing between an executable and the uploads directory.
 *
 * These are signatures, not a parser. Each one is the sequence every
 * file of that format is required to start with.
 */

export type DetectedKind = 'image' | 'video';

export interface DetectedType {
  /** The real mime type, from the bytes. */
  mime: string;
  kind: DetectedKind;
  /** True for a GIF or WebP that carries more than one frame. */
  animated?: boolean;
}

/** True when `bytes` appear at `offset` in `buf`. */
function at(buf: Buffer, offset: number, bytes: number[]): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

/** ASCII marker at a fixed offset — used by the RIFF and ISO families. */
function ascii(buf: Buffer, offset: number, text: string): boolean {
  if (buf.length < offset + text.length) return false;
  return buf.toString('latin1', offset, offset + text.length) === text;
}

/**
 * Whether a GIF holds more than one image.
 *
 * Counts Image Descriptor blocks (0x2C). One is a still; two or more
 * is an animation. Deliberately a scan for the marker rather than a
 * full parse of the block structure: getting this exactly right needs a
 * GIF decoder, and the only decision resting on it is whether to ask
 * sharp for `animated: true`, which is harmless when wrong in the
 * cautious direction.
 */
function gifIsAnimated(buf: Buffer): boolean {
  let count = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x2c) {
      count++;
      if (count > 1) return true;
    }
  }
  return false;
}

/**
 * Identifies a buffer, or returns null when it is nothing we accept.
 *
 * Null is the answer for "not one of ours" — a PDF, a zip, an
 * executable, an empty file. The caller turns that into a refusal with
 * the claimed type in the message, because that is the part the person
 * uploading can act on.
 */
export function detectType(buf: Buffer): DetectedType | null {
  if (buf.length < 12) return null;

  // ── images ────────────────────────────────────────────────────────
  if (at(buf, 0, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', kind: 'image' };
  if (at(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: 'image/png', kind: 'image' };
  }
  if (ascii(buf, 0, 'GIF87a') || ascii(buf, 0, 'GIF89a')) {
    return { mime: 'image/gif', kind: 'image', animated: gifIsAnimated(buf) };
  }
  // TIFF, both byte orders.
  if (at(buf, 0, [0x49, 0x49, 0x2a, 0x00]) || at(buf, 0, [0x4d, 0x4d, 0x00, 0x2a])) {
    return { mime: 'image/tiff', kind: 'image' };
  }

  // ── the RIFF family: WebP shares its container with WAV and AVI ───
  if (ascii(buf, 0, 'RIFF') && ascii(buf, 8, 'WEBP')) {
    // VP8X is the only WebP chunk that can be animated, and its flags
    // are the first byte of the payload. The chunk starts at 12 with a
    // four-byte fourcc and a four-byte length, so the flags are at 20 —
    // not at 16, where the length is.
    const animated = ascii(buf, 12, 'VP8X') && ((buf[20] ?? 0) & 0x02) !== 0;
    return { mime: 'image/webp', kind: 'image', animated };
  }

  // ── the ISO base media family: MP4, and AVIF, which is not video ──
  if (ascii(buf, 4, 'ftyp')) {
    const brand = buf.toString('latin1', 8, 12);
    // AVIF and its sequence variant are stills in a video container.
    if (brand === 'avif' || brand === 'avis') {
      return { mime: 'image/avif', kind: 'image' };
    }
    // Everything else in this family that we accept is MP4. The brand
    // says which flavour; none of them change how it is handled.
    return { mime: 'video/mp4', kind: 'video' };
  }

  // ── Matroska: WebM and MKV share it, and only WebM is web-playable ─
  if (at(buf, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
    // The doctype sits in the header, close to the start.
    const head = buf.toString('latin1', 0, Math.min(buf.length, 256));
    if (head.includes('webm')) return { mime: 'video/webm', kind: 'video' };
    // An MKV would very likely play, but "very likely" is not a promise
    // to make about a file a reader will be served.
    return null;
  }

  // QuickTime .mov, common straight off a phone and NOT reliably
  // playable in a browser. Recognised so the refusal can say what it
  // is and what to do, rather than "tipo não suportado".
  if (ascii(buf, 4, 'moov') || ascii(buf, 4, 'mdat')) {
    return { mime: 'video/quicktime', kind: 'video' };
  }

  return null;
}
