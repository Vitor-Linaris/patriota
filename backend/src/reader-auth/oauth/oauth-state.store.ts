import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { RedisService } from '../../redis/redis.service';

/** How long a reader has to complete the round trip to the provider. */
export const STATE_TTL_SECONDS = 10 * 60;

/** How long the one-time code stays exchangeable once they come back. */
const CODE_TTL_SECONDS = 60;

interface StatePayload {
  /** Sanitised same-origin path to land on afterwards. */
  next: string;
  /**
   * SHA-256 of the binding secret handed to the browser as a cookie.
   *
   * Hashed rather than stored raw so a dump of Redis — a snapshot, a
   * misconfigured `KEYS *`, an operator's shoulder — does not hand
   * anybody a usable half of the pair.
   */
  bindingHash: string;
}

/** What the caller must set as a cookie and give back at the callback. */
export interface IssuedState {
  state: string;
  binding: string;
}

function hashBinding(binding: string): string {
  return createHash('sha256').update(binding).digest('hex');
}

/** Constant-time compare of two hex digests of known equal length. */
function sameDigest(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The two short-lived secrets the OAuth flow needs, both in Redis.
 *
 * `state` is the CSRF defence: without it, an attacker can complete an
 * authorization flow of their own and hand the victim the callback URL,
 * logging the victim into the ATTACKER's account. It also carries the
 * `next` path, which cannot ride in the URL because the provider echoes
 * back only what we sent. It is paired with a browser-bound cookie —
 * see issueState() — because "unspent" alone does not say "yours".
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

  /**
   * Mints a state and the secret that ties it to ONE browser.
   *
   * "Unspent" was never enough on its own. An attacker who starts the
   * flow on their own account, captures the resulting callback URL
   * WITHOUT following it, and gets a victim to open it inside the ten
   * minutes has handed over a state that is still valid and still
   * unspent — and the victim's browser silently ends up logged into the
   * attacker's account, where everything they then read, save or write
   * belongs to somebody else.
   *
   * The second half closes it: the callback must also present a secret
   * that only exists in the cookie jar of the browser that STARTED the
   * flow. The attacker can copy the URL; they cannot put a cookie into
   * somebody else's browser for our origin.
   */
  async issueState(next: string): Promise<IssuedState> {
    const state = randomBytes(24).toString('base64url');
    const binding = randomBytes(32).toString('base64url');
    await this.redis.getClient().set(
      this.stateKey(state),
      JSON.stringify({
        next,
        bindingHash: hashBinding(binding),
      } satisfies StatePayload),
      'EX',
      STATE_TTL_SECONDS,
    );
    return { state, binding };
  }

  /**
   * Consumes the state. Returns null when it is unknown, expired,
   * already used, or presented by a browser other than the one that
   * started the flow — all of which must abort the login.
   *
   * GETDEL so a replayed callback cannot succeed twice, and it runs
   * BEFORE the binding check on purpose: a wrong cookie burns the state
   * too, so an attacker cannot use a victim's failed attempt to find out
   * whether their own state is still alive.
   */
  async consumeState(
    state: string | undefined,
    binding: string | undefined,
  ): Promise<StatePayload | null> {
    if (!state) return null;
    const raw = await this.redis.getClient().getdel(this.stateKey(state));
    if (!raw) return null;

    let payload: StatePayload;
    try {
      payload = JSON.parse(raw) as StatePayload;
    } catch {
      return null;
    }

    if (!binding || typeof payload.bindingHash !== 'string') return null;
    if (!sameDigest(payload.bindingHash, hashBinding(binding))) return null;
    return payload;
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
