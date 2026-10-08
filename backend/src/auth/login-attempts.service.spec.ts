import {
  LOCK_WINDOW_SECONDS,
  LoginAttemptsService,
} from './login-attempts.service';
import type { RedisService } from '../redis/redis.service';
import type { PrismaService } from '../prisma/prisma.service';

/** A Redis that keeps counters in a Map — enough for incr/get/del/expire. */
function fakeRedis() {
  const store = new Map<string, number>();
  const client = {
    get: jest.fn((k: string) =>
      Promise.resolve(store.has(k) ? String(store.get(k)) : null),
    ),
    incr: jest.fn((k: string) => {
      store.set(k, (store.get(k) ?? 0) + 1);
      return Promise.resolve(store.get(k));
    }),
    expire: jest.fn(() => Promise.resolve(1)),
    del: jest.fn((k: string) => Promise.resolve(store.delete(k) ? 1 : 0)),
  };
  return { client, service: { getClient: () => client } };
}

function make(maxLoginAttempts?: unknown) {
  const redis = fakeRedis();
  const prisma = {
    setting: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          maxLoginAttempts === undefined
            ? null
            : { data: { maxLoginAttempts } },
        ),
    },
  };
  const service = new LoginAttemptsService(
    redis.service as unknown as RedisService,
    prisma as unknown as PrismaService,
  );
  return { service, redis: redis.client, prisma };
}

describe('LoginAttemptsService', () => {
  it('locks an account after the configured number of failures', async () => {
    const { service } = make('3');
    for (let i = 0; i < 2; i++) await service.recordFailure('ana@x.pt');
    expect(await service.isLocked('ana@x.pt')).toBe(false);

    await service.recordFailure('ana@x.pt');
    expect(await service.isLocked('ana@x.pt')).toBe(true);
  });

  it('counts the address, not its spelling', async () => {
    // Otherwise "Ana@X.pt" would be a fresh set of attempts.
    const { service } = make('3');
    await service.recordFailure('Ana@X.pt');
    await service.recordFailure(' ana@x.pt');
    await service.recordFailure('ANA@x.PT');
    expect(await service.isLocked('ana@x.pt')).toBe(true);
  });

  it('starts the window on the first failure and does not extend it', async () => {
    const { service, redis } = make('5');
    await service.recordFailure('ana@x.pt');
    await service.recordFailure('ana@x.pt');
    expect(redis.expire).toHaveBeenCalledTimes(1);
    expect(redis.expire).toHaveBeenCalledWith(
      'login-fail:ana@x.pt',
      LOCK_WINDOW_SECONDS,
    );
  });

  it('clears the failures on a successful login', async () => {
    const { service } = make('3');
    for (let i = 0; i < 3; i++) await service.recordFailure('ana@x.pt');
    await service.reset('ana@x.pt');
    expect(await service.isLocked('ana@x.pt')).toBe(false);
  });

  it('falls back to 5 when the setting is missing or out of range', async () => {
    for (const value of [undefined, '1', '100', 'abc']) {
      const { service } = make(value);
      for (let i = 0; i < 4; i++) await service.recordFailure('a@x.pt');
      expect(await service.isLocked('a@x.pt')).toBe(false);
      await service.recordFailure('a@x.pt');
      expect(await service.isLocked('a@x.pt')).toBe(true);
    }
  });

  it('lets people in when Redis is down rather than locking everyone out', async () => {
    const { service, redis } = make('3');
    redis.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await service.isLocked('ana@x.pt')).toBe(false);
    redis.incr.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(service.recordFailure('ana@x.pt')).resolves.toBeUndefined();
  });
});
