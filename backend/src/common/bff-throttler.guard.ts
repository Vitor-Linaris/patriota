import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/** What the BFF sends, and what proves it is the BFF. */
export const CLIENT_IP_HEADER = 'x-patriota-client-ip';
export const BFF_SECRET_HEADER = 'x-patriota-bff';

/** Constant-time, and false for anything that is not a single string. */
function matches(sent: unknown, expected: string): boolean {
  if (typeof sent !== 'string') return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Same shape as an IPv4/IPv6 address, and nothing else. */
const IP_SHAPE = /^[0-9a-fA-F:.]{3,45}$/;

/**
 * Rate limiting that can still tell two visitors apart.
 *
 * Every request a browser makes to this API arrives through the Next
 * BFF, server-side, which opens its own connection and forwards no
 * client address of any kind. `trust proxy = 1` then finds no
 * X-Forwarded-For to read and `req.ip` resolves to the Next process
 * itself — so ALL of the public shares one bucket. Five failed logins by
 * any one visitor spent the whole newsroom's login budget, and the
 * defence the limits exist to provide was, in practice, a denial of
 * service against everybody else.
 *
 * The client address therefore has to be carried explicitly. The catch
 * is that this API is also reachable directly by a browser — the OAuth
 * legs are a plain top-level navigation to it — so a header alone would
 * simply hand every attacker a per-request choice of bucket, which is
 * worse than one shared bucket.
 *
 * Hence the pair: the address in one header, and a shared secret in
 * another that only the BFF has. No secret, or the wrong one, and the
 * address is ignored and `req.ip` stands. With BFF_SHARED_SECRET unset
 * the guard behaves exactly as before and says so once at boot, so a
 * deployment that has not been given the secret degrades to the old
 * behaviour rather than to no limits at all.
 */
@Injectable()
export class BffThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(BffThrottlerGuard.name);
  private warned = false;

  protected async getTracker(raw: Record<string, unknown>): Promise<string> {
    const req = raw as unknown as Request;
    const secret = process.env.BFF_SHARED_SECRET;

    if (!secret) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          'BFF_SHARED_SECRET não está definido: os limites de pedidos contam ' +
            'todo o tráfego vindo do Next como um único visitante. Defina-o ' +
            'em ambos os serviços (ver .env.example).',
        );
      }
      return req.ip ?? 'desconhecido';
    }

    const claimed = req.headers[CLIENT_IP_HEADER];
    if (
      matches(req.headers[BFF_SECRET_HEADER], secret) &&
      typeof claimed === 'string' &&
      IP_SHAPE.test(claimed)
    ) {
      return claimed;
    }

    return req.ip ?? 'desconhecido';
  }
}
