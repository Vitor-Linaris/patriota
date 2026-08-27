import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { RedisService } from '../../redis/redis.service';

/** How long a reader has to complete the round trip to the provider. */
const STATE_TTL_SECONDS = 10 * 60;

/** How long the one-time code stays exchangeable once they come back. */
const CODE_TTL_SECONDS = 60;

interface StatePayload {
  /** Sanitised same-origin path to land on afterwards. */
  next: string;
}

/**
 * The two short-lived secrets the OAuth flow needs, both in Redis.
 *
 * `state` is the CSRF defence: without it, an attacker can complete an
 * authorization flow of their own and hand the victim the callback URL,
 * logging the victim into the ATTACKER's account. It also carries the
 * `next` path, which cannot ride in the URL because the provider echoes
 * back only what we sent.
 *
 * `code` exists so the session token never appears in a redirect URL.
 * A JWT in the query string lands in browser history, in the Referer of
 * every subsequent request, and in the access log of every proxy in
 * between. Instead the callback stores the token under a random code,
 * redirects with only that code, and the frontend exchanges it
 * server-side. Single use, one minute.
 *
 * Redis rather than Postgres, unlike EmailToken: these live for minutes,
 * are worthless once used, and losing them to a cache flush costs a
 * retry rather than an audit gap.
 */
@Injectable()
export class OAuthStateStore {
  constructor(private readonly redis: RedisService) {}

  private stateKey(state: string): string {
    return `oauth:state:${state}`;
  }

  private codeKey(code: string): string {
    return `oauth:code:${code}`;
  }

  async issueState(next: string): Promise<string> {
    const state = randomBytes(24).toString('base64url');
    await this.redis
      .getClient()
      .set(
        this.stateKey(state),
        JSON.stringify({ next } satisfies StatePayload),
        'EX',
        STATE_TTL_SECONDS,
      );
    return state;
  }

  /**
   * Consumes the state. Returns null when it is unknown, expired or
   * already used — all of which must abort the login.
   *
   * GETDEL so a replayed callback cannot succeed twice.
   */
  async consumeState(state: string | undefined): Promise<StatePayload | null> {
    if (!state) return null;
    const raw = await this.redis.getClient().getdel(this.stateKey(state));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StatePayload;
    } catch {
      return null;
    }
  }

  /** Parks a freshly minted session token behind a one-time code. */
  async issueCode(accessToken: string): Promise<string> {
    const code = randomBytes(24).toString('base64url');
    await this.redis
      .getClient()
      .set(this.codeKey(code), accessToken, 'EX', CODE_TTL_SECONDS);
    return code;
  }

  /** Single use: the code is destroyed as it is read. */
  async consumeCode(code: string): Promise<string | null> {
    return this.redis.getClient().getdel(this.codeKey(code));
  }
}
