import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ReaderTokenService } from '../reader-token.service';
import { ReaderMailService } from '../reader-mail.service';
import type { ReaderAuthProvider } from '../../../generated/prisma/enums';
import {
  isSuspended,
  lapseData,
  suspensionLapsed,
  suspensionMessage,
} from '../reader-suspension';

/** What a strategy hands over, normalised across providers. */
export interface OAuthProfile {
  provider: ReaderAuthProvider;
  providerAccountId: string;
  email: string | null;
  /** Whether the PROVIDER asserts the address is verified. */
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: ReaderTokenService,
    private readonly mail: ReaderMailService,
  ) {}

  /**
   * Turns a provider profile into a reader session.
   *
   * Three paths, in order:
   *   1. The identity is already linked → log in. Nothing else matters.
   *   2. No identity, but an account exists with that address → LINK,
   *      but only under the rules below.
   *   3. Nothing exists → create a verified reader.
   *
   * ── Why the linking rules are strict ─────────────────────────────
   * "Log in with X, then merge into whatever local account shares the
   * e-mail" is a classic account-takeover primitive. If a provider will
   * assert an address it never verified, anyone who can create an
   * account there with victim@example.com inherits the victim's reader
   * account — comments, saved articles and, in phase 2, their paid plan.
   *
   * So: Google may auto-link, but only when Google says the address is
   * verified AND our own row was already verified. Facebook may never
   * auto-link onto an account that has a password; Facebook has
   * historically returned addresses it had not verified, and a password
   * account is one somebody deliberately created. Those readers are told
   * to sign in normally and link from their settings instead.
   */
  async signIn(profile: OAuthProfile): Promise<{ accessToken: string }> {
    const existingIdentity = await this.prisma.readerIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      select: {
        reader: {
          select: {
            id: true,
            tokenVersion: true,
            status: true,
            suspendedUntil: true,
            suspensionReason: true,
            emailVerifiedAt: true,
          },
        },
      },
    });

    // ── 1. Already linked ────────────────────────────────────────────
    if (existingIdentity) {
      const reader = existingIdentity.reader;
      if (reader.status === 'ANONIMIZADO') {
        throw new ConflictException('Conta indisponível.');
      }
      // Signing in through Google proves the account is theirs just as a
      // password does, so they get the real reason and the end date
      // rather than a shrug.
      if (isSuspended(reader)) {
        throw new ForbiddenException(suspensionMessage(reader));
      }
      await this.prisma.reader.update({
        where: { id: reader.id },
        data: {
          lastLoginAt: new Date(),
          ...(suspensionLapsed(reader) ? lapseData(reader) : {}),
        },
      });
      return { accessToken: await this.tokens.sign(reader) };
    }

    const email = profile.email?.trim().toLowerCase() ?? null;
    if (!email) {
      // Without an address there is nothing to key an account on, and
      // silently minting an unreachable account would be worse.
      throw new ConflictException(
        'A rede social não forneceu um endereço de e-mail. Crie conta com e-mail.',
      );
    }

    const existingReader = await this.prisma.reader.findUnique({
      where: { email },
      select: {
        id: true,
        tokenVersion: true,
        status: true,
        suspendedUntil: true,
        suspensionReason: true,
        password: true,
        emailVerifiedAt: true,
      },
    });

    // ── 2. Link to an existing account, if the rules allow ────────────
    if (existingReader) {
      if (existingReader.status === 'ANONIMIZADO') {
        throw new ConflictException('Conta indisponível.');
      }
      if (isSuspended(existingReader)) {
        throw new ForbiddenException(suspensionMessage(existingReader));
      }

      if (!this.mayAutoLink(profile, existingReader)) {
        this.logger.warn(
          `Refused auto-link of ${profile.provider} identity to reader ${existingReader.id}`,
        );
        // "…e associe a rede social nas definições" used to be the
        // second half of this message. There is no such setting — no
        // route, no page, nothing links an identity onto an
        // already-signed-in reader. Promising it sent whoever hit this
        // refusal looking for a button that has never existed.
        throw new ConflictException(
          'Já existe uma conta com este e-mail. Inicie sessão com a sua palavra-passe.',
        );
      }

      await this.prisma.$transaction([
        this.prisma.readerIdentity.create({
          data: {
            readerId: existingReader.id,
            provider: profile.provider,
            providerAccountId: profile.providerAccountId,
            email,
          },
        }),
        this.prisma.reader.update({
          where: { id: existingReader.id },
          data: {
            lastLoginAt: new Date(),
            // Linking a verified provider identity proves the mailbox.
            ...(existingReader.emailVerifiedAt
              ? {}
              : { emailVerifiedAt: new Date(), status: 'ATIVO' as const }),
          },
        }),
      ]);

      return { accessToken: await this.tokens.sign(existingReader) };
    }

    // ── 3. Brand new reader ──────────────────────────────────────────
    const created = await this.prisma.reader.create({
      data: {
        email,
        // No password: this is a social-only account. ReaderAuthService
        // .login() rejects a null password before comparing, while still
        // burning a dummy hash so the branch is not timeable.
        password: null,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        // The provider vouched for the address, so there is nothing left
        // for a verification e-mail to prove.
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
        status: profile.emailVerified ? 'ATIVO' : 'PENDENTE_VERIFICACAO',
        lastLoginAt: new Date(),
        unsubscribeToken: randomBytes(32).toString('base64url'),
        identities: {
          create: {
            provider: profile.provider,
            providerAccountId: profile.providerAccountId,
            email,
          },
        },
      },
      select: { id: true, tokenVersion: true },
    });

    this.logger.log(`Created reader ${created.id} via ${profile.provider}.`);
    // Fire-and-forget, same as every other mail dispatched from a
    // moderation or auth action: a slow ESP must not turn a successful
    // sign-in into a failed one. Only THIS branch — never the existing-
    // identity login above, and never the account-linking branch, which
    // is an existing reader gaining a second way in, not a new one.
    void this.mail.sendWelcome(email, profile.name);
    return { accessToken: await this.tokens.sign(created) };
  }

  private mayAutoLink(
    profile: OAuthProfile,
    reader: { password: string | null; emailVerifiedAt: Date | null },
  ): boolean {
    // Facebook: never onto an account somebody set a password on.
    if (profile.provider === 'FACEBOOK') {
      return reader.password === null;
    }

    // Google: both sides must already have proven the address.
    return profile.emailVerified && reader.emailVerifiedAt !== null;
  }

  /** Providers with credentials configured — drives the login-page buttons. */
  static configured(): ReaderAuthProvider[] {
    const out: ReaderAuthProvider[] = [];
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      out.push('GOOGLE');
    }
    if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
      out.push('FACEBOOK');
    }
    return out;
  }
}
