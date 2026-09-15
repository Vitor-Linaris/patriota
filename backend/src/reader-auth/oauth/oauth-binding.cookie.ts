import type { Request, Response } from 'express';

/**
 * The cookie that ties an OAuth round trip to the browser that started
 * it. Half of the pair; the other half is the state in Redis.
 *
 * Written on the initiate leg and read on the callback leg. Both legs
 * are top-level navigations to THIS origin — the reader's browser goes
 * to the provider and comes back here directly, never through the Next
 * BFF — so the cookie is set and read on the same host with no CORS and
 * no forwarding involved.
 */
export const OAUTH_BINDING_COOKIE = 'oauth_bind';

/**
 * Scoped to the OAuth routes and nothing else. This cookie is not a
 * session; it has no business riding along on every article request.
 */
const COOKIE_PATH = '/public/reader/auth';

/**
 * Parsed by hand because this app runs no cookie-parser: the API is a
 * bearer-token service and this is the only cookie it has ever needed.
 * Adding global middleware to read one value on two routes would put a
 * parsed `req.cookies` in front of every other handler in the app and
 * invite somebody to start trusting it.
 */
export function readBindingCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== OAUTH_BINDING_COOKIE) continue;
    return decodeURIComponent(part.slice(eq + 1).trim()) || undefined;
  }
  return undefined;
}

export function setBindingCookie(
  req: Request,
  res: Response,
  binding: string,
  ttlSeconds: number,
): void {
  res.cookie(OAUTH_BINDING_COOKIE, binding, {
    httpOnly: true,
    // Lax, not Strict: the callback arrives as a top-level navigation
    // from the provider's origin, and Strict would withhold the cookie
    // on exactly the one request that needs it — turning every social
    // login into a failure.
    sameSite: 'lax',
    // Follows the request rather than an env flag, so a local http
    // deployment still works and a real one behind TLS is never sent a
    // cookie the browser will refuse to store.
    secure: req.protocol === 'https',
    path: COOKIE_PATH,
    maxAge: ttlSeconds * 1000,
  });
}

/** Always called at the end of the callback, success or failure. */
export function clearBindingCookie(req: Request, res: Response): void {
  res.clearCookie(OAUTH_BINDING_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.protocol === 'https',
    path: COOKIE_PATH,
  });
}
