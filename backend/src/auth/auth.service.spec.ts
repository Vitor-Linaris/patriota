import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

// bcryptjs exports non-configurable properties, so jest.spyOn cannot wrap
// them. Mock the module and delegate to the real implementation: the
// point of these tests is WHAT is passed to compare(), and the real
// derivation must still run for the "actually derives a key" assertion.
jest.mock('bcryptjs', () => {
  const actual = jest.requireActual('bcryptjs');
  return { ...actual, compare: jest.fn(actual.compare) };
});
const compareMock = bcrypt.compare as unknown as jest.Mock;

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  afterEach(() => compareMock.mockClear());

  describe('login() timing equalisation', () => {
    // The anti-enumeration measure here is "run bcrypt anyway when the
    // user does not exist". It only works if the value handed to
    // compare() is a WELL-FORMED bcrypt hash: bcryptjs short-circuits to
    // false on the next tick for anything whose length is not exactly 60,
    // deriving no key at all. A 65-character placeholder therefore made
    // the not-found branch free while the found branch ran a full cost-12
    // derivation — the whole KDF of difference, readable from a single
    // request. These tests pin the property bcryptjs actually branches on.

    it('compares against a well-formed 60-char hash when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.login('nobody@example.invalid', 'whatever'),
      ).rejects.toThrow(UnauthorizedException);

      expect(compareMock).toHaveBeenCalledTimes(1);
      const hashUsed = compareMock.mock.calls[0][1] as string;
      expect(hashUsed).toHaveLength(60);
      // getRounds() parses the cost out of the digest; it throws on a
      // malformed hash, which is itself the assertion we want.
      expect(bcrypt.getRounds(hashUsed)).toBe(12);
    });

    it('spends real derivation time on the not-found branch', async () => {
      // The security property itself, measured rather than inferred: a
      // cost-12 pure-JS bcrypt takes ~200ms on ordinary hardware, while
      // the short-circuit returns in under a millisecond. The threshold
      // is deliberately a fraction of that so a loaded CI box cannot make
      // it flaky — anything above it means a key was actually derived.
      prisma.user.findUnique.mockResolvedValueOnce(null);

      const started = Date.now();
      await expect(
        service.login('nobody@example.invalid', 'whatever'),
      ).rejects.toThrow(UnauthorizedException);
      const elapsed = Date.now() - started;

      expect(elapsed).toBeGreaterThan(50);
    });

    it('uses the stored hash, not the placeholder, when the user exists', async () => {
      const stored = await bcrypt.hash('correct horse', 4);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        email: 'real@example.pt',
        password: stored,
        isActive: false, // rejected after the comparison, not before it
        role: 'JORNALISTA',
      });
      await expect(
        service.login('real@example.pt', 'correct horse'),
      ).rejects.toThrow(UnauthorizedException);

      expect(compareMock.mock.calls[0][1]).toBe(stored);
    });
  });
  describe('resolveSession()', () => {
    /**
     * A staff token lives 8 hours and had nothing in it to revoke. A
     * password reset done BECAUSE the old password was known to somebody
     * else left that somebody else logged in for the rest of the day —
     * the reader side has carried `tv` since M10 and staff never got it.
     */
    const payload = {
      sub: 'u1',
      email: 'chefe@exemplo.pt',
      role: 'EDITOR_CHEFE' as const,
      typ: 'staff' as const,
      tv: 3,
    };
    const row = {
      id: 'u1',
      email: 'chefe@exemplo.pt',
      name: 'Chefe',
      role: 'EDITOR_CHEFE',
      isActive: true,
      tokenVersion: 3,
    };

    it('accepts a token whose version still matches', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(row);
      await expect(service.resolveSession(payload)).resolves.toMatchObject({
        id: 'u1',
      });
    });

    it('refuses a token issued before the password changed', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ ...row, tokenVersion: 4 });
      await expect(service.resolveSession(payload)).resolves.toBeNull();
    });

    it('refuses a token with no tv claim at all', async () => {
      // Tokens signed before this release. Required, not tolerated: a
      // permissive branch for the rollout window is a branch somebody
      // has to remember to delete.
      const { tv: _tv, ...legacy } = payload;
      await expect(
        service.resolveSession(legacy as typeof payload),
      ).resolves.toBeNull();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('refuses a deactivated account even on a matching version', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ ...row, isActive: false });
      await expect(service.resolveSession(payload)).resolves.toBeNull();
    });
  });
});
