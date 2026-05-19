import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { RedisService } from '../redis/redis.service';

/**
 * Increments a per-day visit counter in Redis on every public page hit.
 * The middleware is fire-and-forget — it never blocks the response.
 *
 * Counted: GET requests to "/", "/artigo/*", "/categoria/*" or any path
 * starting with "/public/" (the SSR fetches these too, which doubles the
 * count somewhat, but it's still a reasonable proxy for traffic).
 *
 * Excluded: requests whose User-Agent looks like a known bot.
 */
@Injectable()
export class VisitsMiddleware implements NestMiddleware {
  constructor(private readonly redis: RedisService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    try {
      if (req.method !== 'GET') return next();
      const path = req.path || req.url || '';
      const counted =
        path === '/' ||
        path.startsWith('/artigo/') ||
        path.startsWith('/categoria/') ||
        path.startsWith('/public/');
      if (!counted) return next();

      const ua = String(req.headers['user-agent'] ?? '');
      if (/bot|crawler|spider|preview|monitor|curl|wget|python-requests/i.test(ua)) {
        return next();
      }

      const today = new Date().toISOString().slice(0, 10);
      const key = `patriota:visits:${today}`;
      // Fire-and-forget — don't block the request even if Redis is slow.
      void this.redis
        .getClient()
        .multi()
        .incr(key)
        .expire(key, 60 * 60 * 24 * 90) // keep 90 days
        .exec()
        .catch(() => undefined);
    } catch {
      /* never bubble up */
    }
    next();
  }
}
