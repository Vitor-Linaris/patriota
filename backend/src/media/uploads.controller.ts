import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize, resolve, sep } from 'node:path';
import { MediaAccessService } from './media-access.service';
import { Public } from '../auth/public.decorator';
import { JwtService } from '@nestjs/jwt';
import {
  AuthService,
  type AuthUser,
  type JwtPayload,
} from '../auth/auth.service';

/** Matches the 30 days the static handler used to send. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Serves everything under /uploads.
 *
 * Replaces `app.useStaticAssets` in main.ts, which served every file to
 * anybody who knew the address. The URLs are unchanged, deliberately and
 * completely: every published article stores the address of its cover
 * image as plain text, and inline images live inside the HTML. Changing
 * the shape would mean rewriting the body of every article ever
 * published, and getting one wrong is a broken image nobody notices.
 *
 * @Public() because most of what it serves IS public — a reader with no
 * session, Googlebot, and the robot that builds a link preview all have
 * to be able to fetch a published article's images. The check happens
 * per file, below, not at the door.
 */
@Controller('uploads')
export class UploadsController {
  private readonly uploadsDir =
    process.env.UPLOADS_DIR ?? '/usr/src/app/uploads';

  constructor(
    private readonly access: MediaAccessService,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Get('*path')
  async serve(
    @Param('path') pathParam: string | string[],
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const relative = Array.isArray(pathParam)
      ? pathParam.join('/')
      : pathParam;

    const absolute = this.safeResolve(relative);
    if (!absolute) throw new NotFoundException();

    if (!(await this.mayServe(relative, req))) {
      // 404 and never 403. A 403 confirms the file exists, which turns
      // this route into a way to probe for unpublished material one
      // guess at a time — and the names are the only secret a private
      // file has.
      throw new NotFoundException();
    }

    await this.send(absolute, res);
  }

  /**
   * Resolves a request path inside the uploads directory, or null.
   *
   * `..` cannot escape: the resolved path is compared against the
   * directory it must sit under. Express normalises most of this, but
   * this route now reads from the filesystem by hand and the check is
   * cheap.
   */
  private safeResolve(relative: string): string | null {
    if (!relative || relative.includes('\0')) return null;
    const root = resolve(this.uploadsDir);
    const target = resolve(join(root, normalize(relative)));
    return target === root || target.startsWith(root + sep) ? target : null;
  }

  /**
   * Whether this request may have this file.
   *
   * Four cases, in the order they are cheapest to answer:
   *
   *  1. Public media — the overwhelming majority, and the only one on
   *     the hot path. Answered from the Redis cache.
   *  2. Staff avatars, which have no Media row by design (they are
   *     written straight to /uploads/avatars and never enter the
   *     library). Admin-only, so they need a session.
   *  3. Private media, for its owner or a SUPER_ADMIN.
   *  4. Private media that is actually live on a published page — a
   *     promotion that was missed. Corrected and served rather than
   *     refused, because the alternative is a broken image on the site.
   */
  private async mayServe(relative: string, req: Request): Promise<boolean> {
    const access = await this.access.forPath(relative);
    if (access.isPublic) return true;

    if (!access.known) {
      // Avatars are the one path we write outside the media library.
      // Everything else unknown is an orphan or a guess: refused.
      if (!relative.startsWith('avatars/')) return false;
      return (await this.staffFrom(req)) !== null;
    }

    const user = await this.staffFrom(req);
    if (user) {
      if (user.role === 'SUPER_ADMIN') return true;
      if (access.ownerId && access.ownerId === user.id) return true;
    }

    return this.access.healIfPublished(relative);
  }

  /**
   * The staff member behind this request, if any.
   *
   * The same three steps JwtAuthGuard takes — verify, require
   * `typ: 'staff'`, load the user — because this route is @Public() and
   * the guard never runs on it. The audience check is not optional: a
   * reader token must not open a newsroom file, and reproducing the
   * verification without it would be exactly how that happens.
   *
   * Returns null instead of throwing: an anonymous request for a public
   * file is the normal case here, not an error.
   *
   * Note what a bearer token means in practice. A browser loading
   * `<img src>` sends no Authorization header, so a private file is
   * never displayed by pointing an image tag straight at this route.
   * The admin previews private media through the Next app, which holds
   * the session cookie on its own origin and forwards the token
   * server-side.
   */
  private async staffFrom(req: Request): Promise<AuthUser | null> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(
        header.slice('Bearer '.length).trim(),
      );
      if (payload.typ !== 'staff') return null;
      return await this.auth.getUserById(payload.sub);
    } catch {
      return null;
    }
  }

  /** Streams the file with the caching the static handler used to set. */
  private async send(absolute: string, res: Response): Promise<void> {
    let size: number;
    try {
      const info = await stat(absolute);
      if (!info.isFile()) throw new NotFoundException();
      size = info.size;
    } catch {
      throw new NotFoundException();
    }

    res.setHeader('Content-Length', size);
    res.setHeader(
      'Cache-Control',
      `public, max-age=${MAX_AGE_SECONDS}, immutable`,
    );
    // The filename carries 8 random bytes and the contents never change
    // under it, so the browser can hold on to it as long as it likes.
    if (absolute.endsWith('.webp')) res.setHeader('Content-Type', 'image/webp');

    createReadStream(absolute).pipe(res);
  }
}
