import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { OAuthService, type OAuthProfile } from './oauth.service';
import { ReaderTokenService } from '../reader-token.service';
import { PrismaService } from '../../prisma/prisma.service';

function makePrismaMock() {
  return {
    readerIdentity: { findUnique: jest.fn(), create: jest.fn() },
    reader: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

function profile(over: Partial<OAuthProfile> = {}): OAuthProfile {
  return {
    provider: 'GOOGLE',
    providerAccountId: 'provider-123',
    email: 'Leitor@Example.COM',
    emailVerified: true,
    name: 'Leitor',
    avatarUrl: null,
    ...over,
  };
}

describe('OAuthService', () => {
  let service: OAuthService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OAuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ReaderTokenService,
          useValue: { sign: jest.fn().mockResolvedValue('signed.jwt') },
        },
      ],
    }).compile();
    service = moduleRef.get(OAuthService);
  });

  describe('an already-linked identity', () => {
    it('logs straight in without touching the email path', async () => {
      prisma.readerIdentity.findUnique.mockResolvedValueOnce({
        reader: { id: 'r1', tokenVersion: 0, status: 'ATIVO' },
      });
      prisma.reader.update.mockResolvedValueOnce({});

      const out = await service.signIn(profile());

      expect(out.accessToken).toBe('signed.jwt');
      expect(prisma.reader.findUnique).not.toHaveBeenCalled();
      expect(prisma.reader.create).not.toHaveBeenCalled();
    });

    it('refuses a suspended reader', async () => {
      prisma.readerIdentity.findUnique.mockResolvedValueOnce({
        reader: { id: 'r1', tokenVersion: 0, status: 'SUSPENSO' },
      });

      await expect(service.signIn(profile())).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('account linking — the takeover surface', () => {
    beforeEach(() => {
      prisma.readerIdentity.findUnique.mockResolvedValue(null);
    });

    it('Google links when both sides have verified the address', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce({
        id: 'r1',
        tokenVersion: 0,
        status: 'ATIVO',
        password: 'hashed',
        emailVerifiedAt: new Date(),
      });

      const out = await service.signIn(
        profile({ provider: 'GOOGLE', emailVerified: true }),
      );

      expect(out.accessToken).toBe('signed.jwt');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('Google refuses when GOOGLE has not verified the address', async () => {
      // Otherwise anyone able to register victim@example.com at a
      // provider that does not verify inherits the local account.
      prisma.reader.findUnique.mockResolvedValueOnce({
        id: 'r1',
        tokenVersion: 0,
        status: 'ATIVO',
        password: 'hashed',
        emailVerifiedAt: new Date(),
      });

      await expect(
        service.signIn(profile({ provider: 'GOOGLE', emailVerified: false })),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('Google refuses when OUR side never verified the address', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce({
        id: 'r1',
        tokenVersion: 0,
        status: 'ATIVO',
        password: 'hashed',
        emailVerifiedAt: null,
      });

      await expect(
        service.signIn(profile({ provider: 'GOOGLE', emailVerified: true })),
      ).rejects.toThrow(ConflictException);
    });

    it('Facebook NEVER links onto an account that has a password', async () => {
      // Facebook has historically returned addresses it had not
      // verified, and a password account is one somebody deliberately
      // created. Those readers must sign in normally and link from
      // their settings.
      prisma.reader.findUnique.mockResolvedValueOnce({
        id: 'r1',
        tokenVersion: 0,
        status: 'ATIVO',
        password: 'hashed',
        emailVerifiedAt: new Date(),
      });

      await expect(
        service.signIn(profile({ provider: 'FACEBOOK', emailVerified: true })),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('Facebook may link onto a social-only account', async () => {
      prisma.reader.findUnique.mockResolvedValueOnce({
        id: 'r1',
        tokenVersion: 0,
        status: 'ATIVO',
        password: null,
        emailVerifiedAt: new Date(),
      });

      const out = await service.signIn(
        profile({ provider: 'FACEBOOK', emailVerified: true }),
      );

      expect(out.accessToken).toBe('signed.jwt');
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('a brand-new reader', () => {
    beforeEach(() => {
      prisma.readerIdentity.findUnique.mockResolvedValue(null);
      prisma.reader.findUnique.mockResolvedValue(null);
      prisma.reader.create.mockResolvedValue({ id: 'r-new', tokenVersion: 0 });
    });

    it('creates a verified, password-less account with the identity attached', async () => {
      await service.signIn(profile());

      const data = prisma.reader.create.mock.calls[0][0].data;
      // Social-only: login() rejects a null password before comparing,
      // while still burning a dummy hash so the branch is not timeable.
      expect(data.password).toBeNull();
      expect(data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(data.status).toBe('ATIVO');
      expect(data.identities.create.providerAccountId).toBe('provider-123');
      // 32 random bytes, base64url — not a guessable cuid.
      expect(data.unsubscribeToken).toHaveLength(43);
    });

    it('lowercases the address so casing cannot fork the account', async () => {
      await service.signIn(profile({ email: 'MiXeD@Example.COM' }));
      expect(prisma.reader.create.mock.calls[0][0].data.email).toBe(
        'mixed@example.com',
      );
    });

    it('refuses when the provider gave no address at all', async () => {
      // Nothing to key an account on, and minting an unreachable
      // account would be worse than failing.
      await expect(service.signIn(profile({ email: null }))).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.reader.create).not.toHaveBeenCalled();
    });
  });

  describe('configured()', () => {
    const saved = { ...process.env };
    afterEach(() => {
      process.env = { ...saved };
    });

    it('reports only providers that have BOTH id and secret', async () => {
      process.env.GOOGLE_CLIENT_ID = 'id';
      process.env.GOOGLE_CLIENT_SECRET = 'secret';
      process.env.FACEBOOK_APP_ID = 'id';
      delete process.env.FACEBOOK_APP_SECRET;

      expect(OAuthService.configured()).toEqual(['GOOGLE']);
    });

    it('reports none when nothing is configured', () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.FACEBOOK_APP_ID;
      delete process.env.FACEBOOK_APP_SECRET;

      expect(OAuthService.configured()).toEqual([]);
    });
  });
});
