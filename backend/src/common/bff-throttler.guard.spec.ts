import {
  BffThrottlerGuard,
  BFF_SECRET_HEADER,
  CLIENT_IP_HEADER,
} from './bff-throttler.guard';

/**
 * getTracker is protected and the guard's constructor wants the whole
 * throttler wiring, none of which this behaviour touches. The prototype
 * is what is under test.
 */
type Tracker = (req: Record<string, unknown>) => Promise<string>;
const track = (guard: BffThrottlerGuard): Tracker =>
  (guard as unknown as { getTracker: Tracker }).getTracker.bind(guard);

function request(headers: Record<string, string> = {}) {
  return { ip: '10.0.0.9', headers };
}

describe('BffThrottlerGuard', () => {
  let guard: BffThrottlerGuard;
  const original = process.env.BFF_SHARED_SECRET;

  beforeEach(() => {
    // Object.create skips the field initialisers, so the one field the
    // fallback path uses is supplied here.
    guard = Object.assign(Object.create(BffThrottlerGuard.prototype), {
      logger: { warn: jest.fn() },
      warned: false,
    }) as BffThrottlerGuard;
    process.env.BFF_SHARED_SECRET = 'segredo-partilhado';
  });

  afterAll(() => {
    if (original === undefined) delete process.env.BFF_SHARED_SECRET;
    else process.env.BFF_SHARED_SECRET = original;
  });

  it('keys on the forwarded address when the BFF proves it sent it', async () => {
    // Without this every browser request counted as one visitor — the
    // Next process — so five failed logins by anybody spent the whole
    // newsroom's budget.
    const key = await track(guard)(
      request({
        [CLIENT_IP_HEADER]: '203.0.113.7',
        [BFF_SECRET_HEADER]: 'segredo-partilhado',
      }),
    );

    expect(key).toBe('203.0.113.7');
  });

  it('ignores an address that arrives without the secret', async () => {
    // THE reason the secret exists. This API is reachable directly by a
    // browser — the OAuth legs are a plain navigation to it — so an
    // address header anybody could set would hand every attacker a
    // per-request choice of bucket, which is worse than one shared one.
    const key = await track(guard)(
      request({ [CLIENT_IP_HEADER]: '203.0.113.7' }),
    );

    expect(key).toBe('10.0.0.9');
  });

  it('ignores an address that arrives with the WRONG secret', async () => {
    const key = await track(guard)(
      request({
        [CLIENT_IP_HEADER]: '203.0.113.7',
        [BFF_SECRET_HEADER]: 'quase-o-segredo',
      }),
    );

    expect(key).toBe('10.0.0.9');
  });

  it('refuses a header that is not shaped like an address', async () => {
    const key = await track(guard)(
      request({
        [CLIENT_IP_HEADER]: 'não; é; um; ip',
        [BFF_SECRET_HEADER]: 'segredo-partilhado',
      }),
    );

    expect(key).toBe('10.0.0.9');
  });

  it('falls back to the connection when no secret is configured', async () => {
    // A deployment that has not been given the secret degrades to the
    // old behaviour, not to no limits at all.
    delete process.env.BFF_SHARED_SECRET;

    const key = await track(guard)(
      request({
        [CLIENT_IP_HEADER]: '203.0.113.7',
        [BFF_SECRET_HEADER]: 'seja-o-que-for',
      }),
    );

    expect(key).toBe('10.0.0.9');
  });
});
