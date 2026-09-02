import { Test } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { ReaderAuthService } from './reader-auth.service';
import { ReaderTokenService } from './reader-token.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * bcryptjs exports non-configurable bindings, so jest.spyOn cannot wrap
 * compare(). Mock the module around the REAL implementation instead: the
 * hashing stays genuine (the cost-12 assertions depend on it) while the
 * calls become observable, which is what the constant-time tests need.
 */
jest.mock('bcryptjs', () => {
  const actual = jest.requireActual<typeof import('bcryptjs')>('bcryptjs');
  return { ...actual, compare: jest.fn(actual.compare) };
});
const compareMock = bcrypt.compare as unknown as jest.Mock;

function makePrismaMock() {
  return {
    reader: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    emailToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    readingHistory: { deleteMany: jest.fn() },
    articleFavorite: { deleteMany: jest.fn() },
    categoryFavorite: { deleteMany: jest.fn() },
    readerIdentity: { deleteMany: jest.fn() },
    articleNotification: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
}

const ACTIVE_READER = {
  id: 'r1',
  email: 'leitor@test.local',
  name: 'Leitor',
  avatarUrl: null,
  emailVerifiedAt: new Date(),
  status: 'ATIVO',
  plan: 'GRATIS',
  tokenVersion: 0,
  displayNamePublic: true,
};

describe('ReaderAuthService', () => {
  let service: ReaderAuthService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let tokens: { sign: jest.Mock };

  beforeEach(async () => {
    compareMock.mockClear();
    prisma = makePrismaMock();
    tokens = { sign: jest.fn().mockResolvedValue('signed.jwt.token') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReaderAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReaderTokenService, useValue: tokens },
      ],
    }).compile();
    service = moduleRef.get(ReaderAuthService);
  });

  describe('register()', () => {
    it('hashes the password with cost 12, matching staff accounts', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce(null);
      prisma.reader.create.mockResolvedValueOnce({ id: 'r1' });
      prisma.emailToken.create.mockResolvedValueOnce({});

      await service.register({ email: 'a@test.local', password: 'password123' });

      const hash = prisma.reader.create.mock.calls[0][0].data.password;
      // bcrypt encodes the cost in the modular crypt prefix.
      expect(hash).toMatch(/^\$2[aby]\$12\$/);
    });

    it('generates a random unsubscribe token rather than relying on cuid', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce(null);
      prisma.reader.create.mockResolvedValueOnce({ id: 'r1' });
      prisma.emailToken.create.mockResolvedValueOnce({});

      await service.register({ email: 'a@test.local', password: 'password123' });

      const token = prisma.reader.create.mock.calls[0][0].data.unsubscribeToken;
      // 32 random bytes in base64url. Guessing this is what stands between
      // an attacker and unsubscribing arbitrary readers, so it must not be
      // short or sequential.
      expect(token).toHaveLength(43);
    });

    it('lowercases the address so casing cannot create a duplicate account', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce(null);
      prisma.reader.create.mockResolvedValueOnce({ id: 'r1' });
      prisma.emailToken.create.mockResolvedValueOnce({});

      await service.register({ email: '  MiXeD@Test.LOCAL ', password: 'password123' });

      expect(prisma.reader.create.mock.calls[0][0].data.email).toBe(
        'mixed@test.local',
      );
    });

    it('does not reveal that an address is taken', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce({
        id: 'r1',
        status: 'ATIVO',
        password: 'hashed',
      });

      const result = await service.register({
        email: 'taken@test.local',
        password: 'password123',
      });

      // No throw, no new row — the controller returns the same 202 either
      // way, so registration cannot be used to enumerate the readership.
      expect(result.alreadyRegistered).toBe(true);
      expect(result.verificationToken).toBeNull();
      expect(prisma.reader.create).not.toHaveBeenCalled();
    });

    it('reports whether the existing account already has a password', async () => {
      // The bug this closes: a reader who signed up through Google has
      // `password: null`. registrationAttemptTemplate needs to know
      // that, or it sends "esqueceu-se da password?" to somebody who
      // never had one — and the reset link it offers used to be a dead
      // end for exactly this account (see forgotPassword() below).
      prisma.reader.findUnique.mockResolvedValueOnce({
        id: 'r1',
        status: 'ATIVO',
        password: null,
      });

      const result = await service.register({
        email: 'social@test.local',
        password: 'password123',
      });

      expect(result.alreadyRegistered).toBe(true);
      expect(result.hasPassword).toBe(false);
    });

    it('stores only the hash of the verification token', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce(null);
      prisma.reader.create.mockResolvedValueOnce({ id: 'r1' });
      prisma.emailToken.create.mockResolvedValueOnce({});

      const { verificationToken } = await service.register({
        email: 'a@test.local',
        password: 'password123',
      });

      const stored = prisma.emailToken.create.mock.calls[0][0].data.tokenHash;
      expect(stored).not.toBe(verificationToken);
      expect(stored).toBe(
        createHash('sha256').update(verificationToken!).digest('hex'),
      );
    });
  });

  describe('login()', () => {
    it('runs a bcrypt comparison even when no such reader exists', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce(null);
      const compare = jest.spyOn(bcrypt, 'compare');

      await expect(
        service.login('ghost@test.local', 'password123'),
      ).rejects.toThrow(UnauthorizedException);

      // Skipping the compare on the miss would make "no such account"
      // measurably faster than "wrong password".
      expect(compareMock).toHaveBeenCalled();
    });

    it('runs a bcrypt comparison for a social-only account too', async () => {
      // password === null. Short-circuiting here would leak which accounts
      // sign in through Google/Facebook.
      prisma.reader.findUnique.mockResolvedValueOnce({
        ...ACTIVE_READER,
        password: null,
      });
      const compare = jest.spyOn(bcrypt, 'compare');

      await expect(
        service.login('leitor@test.local', 'password123'),
      ).rejects.toThrow(UnauthorizedException);

      expect(compareMock).toHaveBeenCalled();
    });

    it('tells a suspended reader they are suspended, and until when', async () => {
      // 403 rather than the 401 every other failure gets, and with the
      // real reason. The password has already been proved correct by the
      // time this fires, so the only person who can read the message is
      // the account holder.
      prisma.reader.findUnique.mockResolvedValueOnce({
        ...ACTIVE_READER,
        status: 'SUSPENSO',
        suspendedUntil: new Date('2099-01-15T00:00:00Z'),
        suspensionReason: 'Insultos repetidos.',
        password: await bcrypt.hash('password123', 4),
      });

      await expect(
        service.login('leitor@test.local', 'password123'),
      ).rejects.toMatchObject({
        status: 403,
        response: expect.objectContaining({
          message: expect.stringContaining('Insultos repetidos.'),
        }),
      });
    });

    it('lets a reader back in once the ban date has passed', async () => {
      // The whole point of dating the ban: nothing ran, nothing was
      // scheduled, the date simply arrived.
      prisma.reader.findUnique.mockResolvedValueOnce({
        ...ACTIVE_READER,
        status: 'SUSPENSO',
        suspendedUntil: new Date('2020-01-01T00:00:00Z'),
        suspensionReason: 'Já cumprido.',
        password: await bcrypt.hash('password123', 4),
      });
      prisma.reader.update.mockResolvedValueOnce({});

      const out = await service.login('leitor@test.local', 'password123');
      expect(out.accessToken).toBeTruthy();

      // And the row is tidied on the way through, so the admin list stops
      // showing a suspension that has expired.
      expect(prisma.reader.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ATIVO',
            suspendedUntil: null,
          }),
        }),
      );
    });

    it('refuses a permanently suspended reader — no end date, no way out', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce({
        ...ACTIVE_READER,
        status: 'SUSPENSO',
        suspendedUntil: null,
        suspensionReason: null,
        password: await bcrypt.hash('password123', 4),
      });

      await expect(
        service.login('leitor@test.local', 'password123'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('issues a token on valid credentials', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce({
        ...ACTIVE_READER,
        password: await bcrypt.hash('password123', 4),
      });
      prisma.reader.update.mockResolvedValueOnce({});

      const session = await service.login('leitor@test.local', 'password123');

      expect(session.accessToken).toBe('signed.jwt.token');
      expect(session.reader.id).toBe('r1');
      // The principal must never carry the hash.
      expect(session.reader as unknown as Record<string, unknown>).not.toHaveProperty('password');
    });
  });

  describe('verifyEmail()', () => {
    it('rejects an expired token', async () => {
      prisma.emailToken.findUnique.mockResolvedValueOnce({
        id: 't1',
        readerId: 'r1',
        type: 'VERIFICACAO_EMAIL',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      });

      await expect(service.verifyEmail('raw')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a token that was already used', async () => {
      prisma.emailToken.findUnique.mockResolvedValueOnce({
        id: 't1',
        readerId: 'r1',
        type: 'VERIFICACAO_EMAIL',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(),
      });

      await expect(service.verifyEmail('raw')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a password-reset token presented to the verify endpoint', async () => {
      // Both types live in one table; without the type check a reset link
      // would double as an email-verification link and vice versa.
      prisma.emailToken.findUnique.mockResolvedValueOnce({
        id: 't1',
        readerId: 'r1',
        type: 'REPOR_PASSWORD',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      });

      await expect(service.verifyEmail('raw')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('looks the token up by hash, never by raw value', async () => {
      prisma.emailToken.findUnique.mockResolvedValueOnce(null);

      await expect(service.verifyEmail('the-raw-token')).rejects.toThrow();

      expect(prisma.emailToken.findUnique.mock.calls[0][0].where.tokenHash).toBe(
        createHash('sha256').update('the-raw-token').digest('hex'),
      );
    });
  });

  describe('forgotPassword()', () => {
    it('issues a token for a social-only account, not just a password one', async () => {
      // The dead end this closes: a reader who signed up through
      // Google/Facebook has password: null. This used to be excluded —
      // "there is nothing to reset" — but registrationAttemptTemplate
      // points EXACTLY this endpoint at them when they try to register
      // a second time, promising a working link. resetPassword() has
      // never cared whether a password existed before; it only writes.
      prisma.reader.findUnique.mockResolvedValueOnce({
        id: 'r1',
        password: null,
        status: 'ATIVO',
        suspendedUntil: null,
        name: 'Leitor Social',
      });
      prisma.emailToken.create.mockResolvedValueOnce({});

      const result = await service.forgotPassword('social@test.local');

      expect(result).not.toBeNull();
      expect(result!.firstPassword).toBe(true);
      expect(prisma.emailToken.create).toHaveBeenCalled();
    });

    it('still marks a normal reset as not-first-password', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce({
        id: 'r1',
        password: 'already-hashed',
        status: 'ATIVO',
        suspendedUntil: null,
        name: 'Leitor',
      });
      prisma.emailToken.create.mockResolvedValueOnce({});

      const result = await service.forgotPassword('normal@test.local');

      expect(result!.firstPassword).toBe(false);
    });

    it('is still null for an address with no account at all', async () => {
      // The non-enumeration rule still holds — only "has a password"
      // stopped gating the response, not "exists".
      prisma.reader.findUnique.mockResolvedValueOnce(null);

      const result = await service.forgotPassword('ninguem@test.local');

      expect(result).toBeNull();
      expect(prisma.emailToken.create).not.toHaveBeenCalled();
    });

    it('is still null for a suspended or anonymised reader', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce({
        id: 'r1',
        password: null,
        status: 'SUSPENSO',
        suspendedUntil: new Date(Date.now() + 86_400_000),
        name: null,
      });

      const result = await service.forgotPassword('suspenso@test.local');

      expect(result).toBeNull();
    });
  });

  describe('resetPassword()', () => {
    it('bumps tokenVersion and clears sibling tokens', async () => {
      prisma.emailToken.findUnique.mockResolvedValueOnce({
        id: 't1',
        readerId: 'r1',
        type: 'REPOR_PASSWORD',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      });
      prisma.$transaction.mockResolvedValueOnce([]);

      await service.resetPassword('raw', 'brand-new-password');

      expect(prisma.$transaction).toHaveBeenCalled();
      // Any other live reset link must die with this one: if an attacker
      // triggered the reset and holds an unused token, leaving it valid
      // hands the account straight back after the owner recovers it.
      expect(prisma.emailToken.deleteMany).toHaveBeenCalledWith({
        where: { readerId: 'r1', type: 'REPOR_PASSWORD', usedAt: null },
      });
      const update = prisma.reader.update.mock.calls[0][0];
      expect(update.data.tokenVersion).toEqual({ increment: 1 });
      expect(update.data.password).toMatch(/^\$2[aby]\$12\$/);
    });

    it('rejects a verification token presented to the reset endpoint', async () => {
      prisma.emailToken.findUnique.mockResolvedValueOnce({
        id: 't1',
        readerId: 'r1',
        type: 'VERIFICACAO_EMAIL',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      });

      await expect(service.resetPassword('raw', 'brand-new-password')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('changePassword()', () => {
    it('refuses without the current password', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce({
        password: await bcrypt.hash('the-real-one', 4),
      });

      await expect(
        service.changePassword('r1', 'wrong', 'brand-new-password'),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.reader.update).not.toHaveBeenCalled();
    });

    it('signs other devices out on success', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce({
        password: await bcrypt.hash('the-real-one', 4),
      });
      prisma.reader.update.mockResolvedValueOnce({});

      await service.changePassword('r1', 'the-real-one', 'brand-new-password');

      expect(prisma.reader.update.mock.calls[0][0].data.tokenVersion).toEqual({
        increment: 1,
      });
    });
  });

  describe('anonymise()', () => {
    it('keeps the row and scrubs it instead of deleting the reader', async () => {
      prisma.$transaction.mockResolvedValueOnce([]);

      await service.anonymise('r1');

      const update = prisma.reader.update.mock.calls[0][0];
      expect(update.data.status).toBe('ANONIMIZADO');
      expect(update.data.name).toBeNull();
      expect(update.data.password).toBeNull();
      expect(update.data.email).toContain('anonimizado+r1@');
      // Deleting the reader would cascade their comments away and tear
      // holes through threads other people are still reading.
      expect(update.data.tokenVersion).toEqual({ increment: 1 });
      expect(update.data.digestFrequency).toBe('NUNCA');
    });
  });
});
