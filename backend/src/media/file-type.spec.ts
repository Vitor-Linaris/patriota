import { detectType } from './file-type';

/** Builds a buffer from a byte prefix, padded so length checks pass. */
const withPrefix = (bytes: number[], pad = 64) =>
  Buffer.concat([Buffer.from(bytes), Buffer.alloc(pad, 0)]);

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe('detectType', () => {
  it('reads the real type out of the bytes', () => {
    expect(detectType(withPrefix([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe(
      'image/jpeg',
    );
    expect(
      detectType(withPrefix([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        ?.mime,
    ).toBe('image/png');
    expect(detectType(withPrefix(ascii('GIF89a')))?.mime).toBe('image/gif');
    expect(detectType(withPrefix([0x49, 0x49, 0x2a, 0x00]))?.mime).toBe(
      'image/tiff',
    );
  });

  it('sees through a lie in the Content-Type', () => {
    // The whole reason this exists. A zip renamed to .png and sent with
    // `Content-Type: image/png` passed the old whitelist; sharp caught
    // it a step later by accident, and video would not pass through
    // sharp at all.
    const zip = withPrefix([0x50, 0x4b, 0x03, 0x04]);
    expect(detectType(zip)).toBeNull();

    const pdf = withPrefix(ascii('%PDF-1.7'));
    expect(detectType(pdf)).toBeNull();

    // A Windows executable, the one that actually matters.
    const exe = withPrefix([0x4d, 0x5a]);
    expect(detectType(exe)).toBeNull();
  });

  it('refuses a file too short to identify', () => {
    expect(detectType(Buffer.alloc(0))).toBeNull();
    expect(detectType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  describe('animation', () => {
    it('tells an animated GIF from a still one', () => {
      // Two Image Descriptor blocks (0x2C) is an animation; one is not.
      const still = Buffer.concat([
        Buffer.from(ascii('GIF89a')),
        Buffer.alloc(32, 0x00),
        Buffer.from([0x2c]),
        Buffer.alloc(32, 0x00),
      ]);
      const moving = Buffer.concat([
        Buffer.from(ascii('GIF89a')),
        Buffer.alloc(16, 0x00),
        Buffer.from([0x2c]),
        Buffer.alloc(16, 0x00),
        Buffer.from([0x2c]),
        Buffer.alloc(16, 0x00),
      ]);

      expect(detectType(still)?.animated).toBe(false);
      expect(detectType(moving)?.animated).toBe(true);
    });

    it('reads the animation bit on a WebP', () => {
      const webp = (flags: number) =>
        Buffer.concat([
          Buffer.from(ascii('RIFF')),
          Buffer.alloc(4, 0),
          Buffer.from(ascii('WEBP')),
          Buffer.from(ascii('VP8X')),
          Buffer.alloc(4, 0),
          Buffer.from([flags]),
          Buffer.alloc(32, 0),
        ]);

      expect(detectType(webp(0x00))?.animated).toBe(false);
      expect(detectType(webp(0x02))?.animated).toBe(true);
    });
  });

  describe('the containers that hold more than one thing', () => {
    const ftyp = (brand: string) =>
      Buffer.concat([
        Buffer.alloc(4, 0),
        Buffer.from(ascii('ftyp')),
        Buffer.from(ascii(brand)),
        Buffer.alloc(32, 0),
      ]);

    it('does not mistake AVIF for video — it shares MP4\'s container', () => {
      expect(detectType(ftyp('avif'))).toEqual({
        mime: 'image/avif',
        kind: 'image',
      });
      expect(detectType(ftyp('isom'))).toEqual({
        mime: 'video/mp4',
        kind: 'video',
      });
    });

    it('accepts WebM but not the MKV it shares a container with', () => {
      const matroska = (doctype: string) =>
        Buffer.concat([
          Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
          Buffer.alloc(20, 0),
          Buffer.from(ascii(doctype)),
          Buffer.alloc(32, 0),
        ]);

      expect(detectType(matroska('webm'))?.mime).toBe('video/webm');
      // An MKV would very likely play in a browser. "Very likely" is
      // not a promise worth making about a file a reader will be served.
      expect(detectType(matroska('matroska'))).toBeNull();
    });

    it('recognises QuickTime so the refusal can say what it is', () => {
      // Straight off an iPhone, and not reliably playable in a browser.
      // Naming it lets the message tell somebody what to do instead of
      // "tipo não suportado".
      const mov = Buffer.concat([
        Buffer.alloc(4, 0),
        Buffer.from(ascii('moov')),
        Buffer.alloc(32, 0),
      ]);
      expect(detectType(mov)?.mime).toBe('video/quicktime');
    });
  });
});
