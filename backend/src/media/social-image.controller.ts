import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { MediaAccessService } from './media-access.service';
import { Public } from '../auth/public.decorator';

/** Same 30 days the uploads route sends. The bytes never change. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Instagram will not take a WebP, and nothing here is stored as anything
 * else.
 *
 * The obvious fix — write a fourth `-social.jpg` variant next to the
 * three WebP ones — is the wrong one, and expensively so. Three separate
 * regular expressions in this codebase know the names our pipeline
 * writes and only those (MediaService.STORAGE_KEY_IN_TEXT,
 * MediaAccessService.keyFromPath, the MIME map in UploadsController), and
 * promoteForPublication walks the same convention when it makes an
 * article's images public. A filename none of them recognise is a file
 * that is never promoted and then 404s — which is exactly the shape of
 * the bug that made pacote covers invisible to readers while looking
 * perfectly fine to anyone logged into the admin.
 *
 * So: no new file. This route resolves the address back to the `-large`
 * WebP the pipeline already wrote, asks the SAME authorisation service
 * the uploads route asks, and transcodes on the way out. It runs once or
 * twice per article — only when Meta comes to fetch the picture for a
 * post — so the cost is a rounding error, and nothing about how media is
 * stored, named or published changes at all.
 *
 * @Public() for the same reason the uploads route is: the caller is
 * Meta's fetcher and it has no session. The file still has to be a
 * published one, and that is decided per request below.
 */
@Controller('social-image')
export class SocialImageController {
  private readonly uploadsDir =
    process.env.UPLOADS_DIR ?? '/usr/src/app/uploads';

  constructor(private readonly access: MediaAccessService) {}

  /**
   * The public address of an article cover as a JPEG, or null when the
   * cover is not one of ours to convert.
   *
   * Given `http://host/uploads/2026/09/abc123-large.webp` this yields
   * `http://origin/social-image/2026/09/abc123.jpg`. An external pasted
   * URL, a seed path, or anything else returns null — the caller then
   * skips Instagram for that article rather than handing Meta an address
   * that will not load.
   */
  static jpegUrlFor(coverImageUrl: string, origin: string): string | null {
    const m = /(\d{4})\/(\d{2})\/([0-9a-f]{8,})-large\.webp(?:$|[?#])/.exec(
      coverImageUrl,
    );
    if (!m) return null;
    return `${origin}/social-image/${m[1]}/${m[2]}/${m[3]}.jpg`;
  }

  @Public()
  @Get(':year/:month/:key.jpg')
  async serve(
    @Param('year') year: string,
    @Param('month') month: string,
    @Param('key') key: string,
    @Res() res: Response,
  ): Promise<void> {
    // The shape is checked before anything touches the filesystem: these
    // three fragments are the only user input on this route and they are
    // about to be joined into a path.
    if (
      !/^\d{4}$/.test(year) ||
      !/^\d{2}$/.test(month) ||
      !/^[0-9a-f]{8,64}$/.test(key)
    ) {
      throw new NotFoundException();
    }

    const relative = `${year}/${month}/${key}-large.webp`;

    // The same question the uploads route asks, answered by the same
    // service and the same cache. A cover that has not been published
    // yet is not handed to Meta — an embargoed piece must not leak
    // through a second door just because this one converts.
    const access = await this.access.forPath(relative);
    if (!access.isPublic) {
      const healed = await this.access.healIfPublished(relative);
      // 404, never 403: a 403 would confirm the file exists and turn
      // this into a way to probe for unpublished work one guess at a
      // time. Same rule as UploadsController.
      if (!healed) throw new NotFoundException();
    }

    const absolute = this.safeResolve(relative);
    if (!absolute) throw new NotFoundException();

    let jpeg: Buffer;
    try {
      jpeg = await toInstagramJpeg(await readFile(absolute));
    } catch {
      throw new NotFoundException();
    }

    res.setHeader(
      'Cache-Control',
      `public, max-age=${MAX_AGE_SECONDS}, immutable`,
    );
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', jpeg.length);
    res.end(jpeg);
  }

  /** Belt and braces behind the regexes above — see UploadsController. */
  private safeResolve(relative: string): string | null {
    const root = resolve(this.uploadsDir);
    const target = resolve(join(root, relative));
    return target.startsWith(root + sep) ? target : null;
  }
}

/**
 * Instagram will only accept an image between 4:5 and 1.91:1, and this
 * library does not remotely respect that.
 *
 * Measured, not assumed: the covers actually in this database run from
 * 4.09:1 (a wide banner) to 0.50:1 (a portrait poster), with 2.05:1 and
 * 2.00:1 the most common shapes of all. Handing any of those straight to
 * the container step is a rejection from Meta with a message about
 * aspect ratio, on the article nobody was watching.
 *
 * Cropping to fit is the wrong answer for a newspaper: the subject of a
 * news photograph is not reliably in the middle, and silently cutting
 * somebody out of their own picture is not a thing to do automatically.
 *
 * So the whole image is kept, scaled to fit inside the nearest allowed
 * ratio, over a blurred enlargement of itself. Nothing is lost, the
 * result fills the frame, and it is what news accounts on the platform
 * already look like.
 */
export async function toInstagramJpeg(input: Buffer): Promise<Buffer> {
  /** Instagram's documented bounds: 4:5 portrait to 1.91:1 landscape. */
  const MIN_RATIO = 0.8;
  const MAX_RATIO = 1.91;
  /** Instagram downscales anything wider; no point sending more. */
  const MAX_EDGE = 1440;

  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error('Imagem sem dimensões.');

  const ratio = width / height;
  const target = Math.min(Math.max(ratio, MIN_RATIO), MAX_RATIO);

  // Already acceptable: no canvas, no bars, just the transcode. The
  // common case should cost the least and change the least.
  if (Math.abs(target - ratio) < 0.001) {
    return sharp(input)
      .resize({ width: Math.min(width, MAX_EDGE), withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, progressive: true })
      .toBuffer();
  }

  const canvasWidth = Math.min(MAX_EDGE, Math.max(width, 1080));
  const canvasHeight = Math.round(canvasWidth / target);

  // The backdrop: the same picture, cropped to fill and blurred hard
  // enough that it reads as colour rather than as a second image.
  const backdrop = await sharp(input)
    .resize(canvasWidth, canvasHeight, { fit: 'cover', position: 'centre' })
    .blur(40)
    .modulate({ brightness: 0.85 })
    .flatten({ background: '#ffffff' })
    .toBuffer();

  // The picture itself, whole.
  const foreground = await sharp(input)
    .resize(canvasWidth, canvasHeight, {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .flatten({ background: '#ffffff' })
    .toBuffer();

  return sharp(backdrop)
    .composite([{ input: foreground, gravity: 'centre' }])
    .jpeg({ quality: 88, progressive: true })
    .toBuffer();
}
