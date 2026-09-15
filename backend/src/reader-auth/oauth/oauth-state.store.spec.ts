import { OAuthStateStore } from './oauth-state.store';
import type { RedisService } from '../../redis/redis.service';

/**
 * Enough Redis for this store: SET with EX, and GETDEL.
 *
 * TTL is recorded but not enforced — expiry is Redis's job, and pinning
 * it here would only re-test ioredis. What IS pinned is that every key
 * goes in with one.
 */
function fakeRedis() {
  const keys = new Map<string, { value: string; ttl: number }>();
  const client = {
    set: jest.fn(
      async (key: string, value: string, _ex: string, ttl: number) => {
        keys.set(key, { value, ttl });
        return 'OK';
      },
    ),
    getdel: jest.fn(async (key: string) => {
      const hit = keys.get(key);
      keys.delete(key);
      return hit?.value ?? null;
    }),
  };
  return {
    keys,
    service: { getClient: () => client } as unknown as RedisService,
  };
}

describe('OAuthStateStore — state bound to one browser', () => {
  let keys: Map<string, { value: string; ttl: number }>;
  let store: OAuthStateStore;

  beforeEach(() => {
    const redis = fakeRedis();
    keys = redis.keys;
    store = new OAuthStateStore(redis.service);
  });

  it('accepts the callback from the browser that started the flow', async () => {
    const { state, binding } = await store.issueState('/conta/guardados');

    await expect(store.consumeState(state, binding)).resolves.toEqual(
      expect.objectContaining({ next: '/conta/guardados' }),
    );
  });

  it('refuses a state presented without the binding cookie', async () => {
    // THE attack. An attacker starts the flow on their own account,
    // copies the callback URL WITHOUT following it, and gets a victim to
    // open it inside the ten minutes. The state is real and unspent; the
    // victim's browser has no cookie for it. Before this check the
    // victim was silently logged into the attacker's account, and
    // everything they then read, saved or commented belonged to somebody
    // else.
    const { state } = await store.issueState('/conta');

    await expect(store.consumeState(state, undefined)).resolves.toBeNull();
  });

  it('refuses a state presented with somebody else’s binding', async () => {
    const mine = await store.issueState('/conta');
    const theirs = await store.issueState('/conta');

    await expect(
      store.consumeState(mine.state, theirs.binding),
    ).resolves.toBeNull();
  });

  it('burns the state even when the binding is wrong', async () => {
    // GETDEL happens before the comparison on purpose: if a failed
    // attempt left the state alive, an attacker could use the victim's
    // rejection to learn that their own link is still good, and simply
    // try somebody else.
    const { state, binding } = await store.issueState('/conta');

    await expect(store.consumeState(state, 'errado')).resolves.toBeNull();
    await expect(store.consumeState(state, binding)).resolves.toBeNull();
  });

  it('never lets the same state through twice', async () => {
    const { state, binding } = await store.issueState('/conta');

    await expect(store.consumeState(state, binding)).resolves.not.toBeNull();
    await expect(store.consumeState(state, binding)).resolves.toBeNull();
  });

  it('keeps the raw binding out of Redis', async () => {
    // A dump of Redis — a snapshot, a stray KEYS *, an operator reading
    // over somebody's shoulder — must not hand anybody a usable half of
    // the pair.
    const { binding } = await store.issueState('/conta');

    for (const { value } of keys.values()) {
      expect(value).not.toContain(binding);
    }
  });

  it('gives every stored key a TTL', async () => {
    await store.issueState('/conta');
    await store.issueCode('jwt');

    for (const { ttl } of keys.values()) {
      expect(ttl).toBeGreaterThan(0);
    }
  });

  it('refuses an absent state without touching Redis', async () => {
    await expect(
      store.consumeState(undefined, 'seja-o-que-for'),
    ).resolves.toBeNull();
    expect(keys.size).toBe(0);
  });
});
