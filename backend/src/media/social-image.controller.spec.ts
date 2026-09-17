import sharp from 'sharp';
import {
  SocialImageController,
  toInstagramJpeg,
} from './social-image.controller';

/**
 * Instagram refuses anything outside 4:5 … 1.91:1, and the covers in
 * this newspaper's library do not respect that even slightly — measured
 * shapes run from 4.09:1 down to 0.50:1. Every one of those has to come
 * out of here inside the allowed band, or the post is rejected by Meta
 * on the one article nobody was watching.
 */
async function solid(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .webp()
    .toBuffer();
}

const MIN = 0.8;
const MAX = 1.91;

describe('toInstagramJpeg', () => {
  it.each([
    ['banner muito largo', 1865, 456],
    ['duplo quadrado', 1865, 911],
    ['retrato alto', 1152, 2048],
    ['retrato estreito', 300, 600],
    ['16:9', 1600, 900],
    ['quadrado', 2048, 2048],
  ])('põe %s dentro dos limites do Instagram', async (_name, w, h) => {
    const out = await sharp(await toInstagramJpeg(await solid(w, h))).metadata();
    const ratio = (out.width ?? 0) / (out.height ?? 1);

    expect(out.format).toBe('jpeg');
    expect(ratio).toBeGreaterThanOrEqual(MIN - 0.01);
    expect(ratio).toBeLessThanOrEqual(MAX + 0.01);
  });

  it('leaves an already-acceptable shape alone rather than padding it', async () => {
    // 1.69:1 is inside the band. Adding blurred bars to a picture that
    // did not need them would be a visible downgrade on the common case.
    const out = await sharp(
      await toInstagramJpeg(await solid(1106, 655)),
    ).metadata();

    expect(out.width).toBe(1106);
    expect(out.height).toBe(655);
  });

  it('does not send Instagram more pixels than it keeps', async () => {
    const out = await sharp(
      await toInstagramJpeg(await solid(4000, 2250)),
    ).metadata();

    expect(out.width).toBeLessThanOrEqual(1440);
  });
});

describe('SocialImageController.jpegUrlFor', () => {
  const origin = 'http://localhost:8585';

  it('rewrites one of our covers into the JPEG route', () => {
    expect(
      SocialImageController.jpegUrlFor(
        'http://localhost:8585/uploads/2026/09/abcdef1234567890-large.webp',
        origin,
      ),
    ).toBe('http://localhost:8585/social-image/2026/09/abcdef1234567890.jpg');
  });

  it.each([
    ['um URL externo colado', 'https://exemplo.pt/foto.jpg'],
    ['um caminho de seed', '/images/seed/politica-1.jpg'],
    ['uma variante que não é a grande', 'http://x/uploads/2026/09/abcdef1234567890-small.webp'],
  ])('devolve null para %s', (_name, url) => {
    // Null means "skip Instagram for this article" — better than
    // handing Meta an address that will not load.
    expect(SocialImageController.jpegUrlFor(url, origin)).toBeNull();
  });
});
