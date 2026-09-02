import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ReaderTokenService } from './reader-token.service';
import type { ReaderPrincipal } from './reader-auth.guard';
import {
  isSuspended,
  lapseData,
  suspensionLapsed,
  suspensionMessage,
} from './reader-suspension';
import { effectivePlan, planActive } from './reader-entitlement';

/** Same cost as staff passwords (users.service.ts). */
const BCRYPT_ROUNDS = 12;

/**
 * Burned when the account does not exist or is social-only, so the
 * response time does not reveal which. Same trick as auth.service.ts:38.
 */
const DUMMY_HASH =
  '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TTL_MS = 60 * 60 * 1000; //  1h

export interface ReaderSession {
  accessToken: string;
  reader: ReaderPrincipal;
}

/** A token to email out, alongside the row that records only its hash. */
interface IssuedToken {
  raw: string;
  expiresAt: Date;
}

@Injectable()
export class ReaderAuthService {
  private readonly logger = new Logger(ReaderAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: ReaderTokenService,
  ) {}

  // ───────────────────────────── helpers ─────────────────────────────

  private normaliseEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Raw value goes in the email; only the hash is ever stored. */
  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async issueEmailToken(
    readerId: string,
    type: 'VERIFICACAO_EMAIL' | 'REPOR_PASSWORD',
  ): Promise<IssuedToken> {
    const raw = randomBytes(32).toString('base64url');
    const ttl = type === 'REPOR_PASSWORD' ? RESET_TTL_MS : VERIFICATION_TTL_MS;
    const expiresAt = new Date(Date.now() + ttl);

    await this.prisma.emailToken.create({
      data: { readerId, type, tokenHash: this.hashToken(raw), expiresAt },
    });
    return { raw, expiresAt };
  }

  private toPrincipal(r: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    emailVerifiedAt: Date | null;
    plan: string;
    planRenewsAt?: Date | null;
    displayNamePublic: boolean;
  }): ReaderPrincipal {
    return {
      id: r.id,
      email: r.email,
      name: r.name,
      avatarUrl: r.avatarUrl,
      emailVerified: r.emailVerifiedAt !== null,
      // Through effectivePlan() for the same reason the guard does it:
      // the session handed back at login must not announce a plan that
      // expired, or the account page shows "Assinante" to somebody the
      // paywall is about to turn away.
      plan: effectivePlan(r),
      displayNamePublic: r.displayNamePublic,
    };
  }

  // ──────────────────────────── registration ────────────────────────────

  /**
   * Always resolves the same way whether or not the address is taken.
   *
   * A 409 here would turn registration into an account-existence oracle
   * for the whole readership, which for a news site is a subscriber list
   * anyone could enumerate. When the address is already registered we send
   * a "someone tried to register with your address" mail instead, so a
   * real owner is not left in the dark.
   *
   * Returns the verification token for the controller to hand to
   * ReaderMailService. The token is returned rather than sent here so the
   * service stays free of transport concerns and remains unit-testable
   * without a mail double.
   */
  async register(input: {
    email: string;
    password: string;
    name?: string;
  }): Promise<{
    verificationToken: string | null;
    alreadyRegistered: boolean;
    /** Name on the account, so the caller can address the mail properly. */
    name: string | null;
    /**
     * Whether the EXISTING account already has a password. Only
     * meaningful when `alreadyRegistered` is true — it decides whether
     * `registrationAttemptTemplate` can say "esqueceu-se?" (they do) or
     * has to say "esta conta é só de rede social" (they never had one).
     */
    hasPassword: boolean;
  }> {
    const email = this.normaliseEmail(input.email);
    const existing = await this.prisma.reader.findUnique({
      where: { email },
      select: { id: true, status: true, name: true, password: true },
    });

    if (existing) {
      // Burn a hash anyway so the taken/free branches cost the same.
      await bcrypt.hash(input.password, BCRYPT_ROUNDS);
      return {
        verificationToken: null,
        alreadyRegistered: true,
        name: existing.name,
        hasPassword: existing.password !== null,
      };
    }

    const reader = await this.prisma.reader.create({
      data: {
        email,
        password: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
        name: input.name?.trim() || null,
        // No @default in the schema on purpose — cuid is guessable and
        // this secret authorises one-click unsubscribe with no session.
        unsubscribeToken: randomBytes(32).toString('base64url'),
      },
      select: { id: true },
    });

    const token = await this.issueEmailToken(reader.id, 'VERIFICACAO_EMAIL');
    return {
      verificationToken: token.raw,
      alreadyRegistered: false,
      name: input.name?.trim() || null,
      // Meaningless on this branch — nothing reads it when
      // alreadyRegistered is false. True because this new account was
      // just given one.
      hasPassword: true,
    };
  }

  /** Re-issues a verification token, or null if there is nothing to verify. */
  async resendVerification(
    rawEmail: string,
  ): Promise<{ token: string; name: string | null } | null> {
    const email = this.normaliseEmail(rawEmail);
    const reader = await this.prisma.reader.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true, status: true, name: true },
    });
    if (!reader || reader.emailVerifiedAt || reader.status === 'ANONIMIZADO') {
      return null;
    }
    const token = await this.issueEmailToken(reader.id, 'VERIFICACAO_EMAIL');
    return { token: token.raw, name: reader.name };
  }

  async verifyEmail(raw: string): Promise<ReaderSession> {
    const row = await this.prisma.emailToken.findUnique({
      where: { tokenHash: this.hashToken(raw) },
      select: { id: true, readerId: true, type: true, expiresAt: true, usedAt: true },
    });

    if (
      !row ||
      row.type !== 'VERIFICACAO_EMAIL' ||
      row.usedAt !== null ||
      row.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Ligação inválida ou expirada.');
    }

    // Check BEFORE writing, not after.
    //
    // This used to set status: 'ATIVO' unconditionally and then test the
    // status it had just written, which of course always passed. The
    // comment claimed it would "never resurrect one that was suspended";
    // the code did exactly that, so an old verification link sitting in
    // an inbox was a way out of a ban.
    const before = await this.prisma.reader.findUnique({
      where: { id: row.readerId },
      select: {
        status: true,
        suspendedUntil: true,
        suspensionReason: true,
        emailVerifiedAt: true,
      },
    });
    if (!before || before.status === 'ANONIMIZADO') {
      throw new UnauthorizedException('Conta indisponível.');
    }
    if (isSuspended(before)) {
      throw new ForbiddenException(suspensionMessage(before));
    }

    const reader = await this.prisma.$transaction(async (tx) => {
      await tx.emailToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      return tx.reader.update({
        where: { id: row.readerId },
        data: {
          emailVerifiedAt: new Date(),
          status: { set: 'ATIVO' },
          lastLoginAt: new Date(),
          // A lapsed ban is cleared here rather than left behind: the
          // account is being confirmed active in the same breath, and
          // leaving the old end date on the row would show up in the
          // admin list as a suspension that is not one.
          ...(suspensionLapsed(before)
            ? {
                suspendedUntil: null,
                suspensionReason: null,
                suspendedById: null,
              }
            : {}),
        },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          emailVerifiedAt: true,
          plan: true,

          planRenewsAt: true,
          displayNamePublic: true,
          tokenVersion: true,
          status: true,
        },
      });
    });

    return {
      accessToken: await this.tokens.sign(reader),
      reader: this.toPrincipal(reader),
    };
  }

  // ─────────────────────────────── login ───────────────────────────────

  async login(rawEmail: string, password: string): Promise<ReaderSession> {
    const email = this.normaliseEmail(rawEmail);
    const reader = await this.prisma.reader.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        password: true,
        emailVerifiedAt: true,
        status: true,
        suspendedUntil: true,
        suspensionReason: true,
        plan: true,

        planRenewsAt: true,
        tokenVersion: true,
        displayNamePublic: true,
      },
    });

    // A social-only account has password === null. Comparing against the
    // dummy keeps the timing identical to "no such account", so neither
    // existence nor sign-in method leaks. Never short-circuit this.
    const hash = reader?.password ?? DUMMY_HASH;
    const valid = await bcrypt.compare(password, hash);

    if (
      !reader ||
      !reader.password ||
      !valid ||
      reader.status === 'ANONIMIZADO'
    ) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    // Told apart from a wrong password on purpose, and only here: by this
    // line the password has already been proved correct, so the only
    // person who can see this message is the account holder. Hiding the
    // ban behind "credenciais inválidas" taught banned readers that the
    // site was broken, and the reliable answer to a broken site is a
    // second account.
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

    return {
      accessToken: await this.tokens.sign(reader),
      reader: this.toPrincipal(reader),
    };
  }

  // ────────────────────────── password recovery ──────────────────────────

  /**
   * Null when there is no account to act on.
   *
   * A social-only reader (signed up through Google/Facebook, `password`
   * still null) is deliberately NOT excluded any more. This used to
   * refuse them — "there is no password to reset" — and that refusal
   * was the dead end: `registrationAttemptTemplate` points a reader who
   * tries to register a second time at this exact endpoint, so a
   * social-only reader who wanted a password too got a mail promising
   * "repor a palavra-passe", clicked it, and nothing happened. No error,
   * no mail, nothing — the account they already had, unreachable by any
   * self-service path.
   *
   * The token this issues is not a *reset*; for such a reader it is a
   * first password, set through the exact same one-time link. Nothing
   * about `resetPassword()` cares whether a password existed before —
   * it only ever overwrites.
   */
  async forgotPassword(
    rawEmail: string,
  ): Promise<{ token: string; name: string | null; firstPassword: boolean } | null> {
    const email = this.normaliseEmail(rawEmail);
    const reader = await this.prisma.reader.findUnique({
      where: { email },
      select: {
        id: true,
        password: true,
        status: true,
        suspendedUntil: true,
        name: true,
      },
    });
    if (!reader || isSuspended(reader) || reader.status === 'ANONIMIZADO') {
      return null;
    }
    const token = await this.issueEmailToken(reader.id, 'REPOR_PASSWORD');
    return {
      token: token.raw,
      name: reader.name,
      firstPassword: reader.password === null,
    };
  }

  async resetPassword(raw: string, nextPassword: string): Promise<void> {
    const row = await this.prisma.emailToken.findUnique({
      where: { tokenHash: this.hashToken(raw) },
      select: { id: true, readerId: true, type: true, expiresAt: true, usedAt: true },
    });

    if (
      !row ||
      row.type !== 'REPOR_PASSWORD' ||
      row.usedAt !== null ||
      row.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Ligação inválida ou expirada.');
    }

    const hashed = await bcrypt.hash(nextPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.emailToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      // Any other outstanding reset link is now a liability — if the reset
      // was triggered by an attacker who also has an unused token, leaving
      // it live would hand the account straight back.
      this.prisma.emailToken.deleteMany({
        where: { readerId: row.readerId, type: 'REPOR_PASSWORD', usedAt: null },
      }),
      this.prisma.reader.update({
        where: { id: row.readerId },
        data: {
          password: hashed,
          // Strands every session already issued, on every device.
          tokenVersion: { increment: 1 },
          // A working reset link proves control of the mailbox.
          emailVerifiedAt: new Date(),
        },
      }),
    ]);
  }

  /** Self-service change; requires the current password. */
  async changePassword(
    readerId: string,
    current: string,
    next: string,
  ): Promise<void> {
    const reader = await this.prisma.reader.findUnique({
      where: { id: readerId },
      select: { password: true },
    });
    if (!reader?.password) {
      throw new ConflictException(
        'Esta conta inicia sessão através de uma rede social e não tem palavra-passe.',
      );
    }
    if (!(await bcrypt.compare(current, reader.password))) {
      throw new UnauthorizedException('Palavra-passe atual incorreta.');
    }
    await this.prisma.reader.update({
      where: { id: readerId },
      data: {
        password: await bcrypt.hash(next, BCRYPT_ROUNDS),
        tokenVersion: { increment: 1 },
      },
    });
  }

  /** "Terminar sessão em todos os dispositivos". */
  async logoutAll(readerId: string): Promise<void> {
    await this.prisma.reader.update({
      where: { id: readerId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  // ──────────────────────────────── account ────────────────────────────────

  async getProfile(readerId: string) {
    const reader = await this.prisma.reader.findUnique({
      where: { id: readerId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        emailVerifiedAt: true,
        status: true,
        plan: true,
        planStatus: true,
        planRenewsAt: true,
        // Whether that date is a renewal or the end. Without it the page
        // cannot tell the difference and defaults to promising a
        // renewal — wrong for everybody who has cancelled.
        planCancelAtPeriodEnd: true,
        planSource: true,
        planStartedAt: true,
        // Never returned as-is — only as the `hasBilling` boolean below.
        // The reader has no use for the id, and it is the handle to a
        // Stripe customer.
        stripeCustomerId: true,
        displayNamePublic: true,
        notifyNewArticles: true,
        digestFrequency: true,
        createdAt: true,
        lastLoginAt: true,
        password: true,
        _count: {
          select: {
            categoryFavorites: true,
            articleFavorites: true,
            comments: true,
            readingHistory: true,
          },
        },
      },
    });
    if (!reader) throw new UnauthorizedException('Sessão inválida.');

    const { password, _count, stripeCustomerId, ...rest } = reader;
    return {
      ...rest,
      /** Lets the UI hide "alterar palavra-passe" on social-only accounts. */
      hasPassword: password !== null,
      /**
       * Whether the plan is live right now, by date.
       *
       * `plan` on its own would say PREMIUM to somebody whose
       * subscription ended last week and who has not been back since —
       * and this is the page where they would come to find out why they
       * cannot read. Same rule the paywall applies, from the same
       * module.
       */
      planActive: planActive(reader),
      /**
       * Whether there is a Stripe customer behind this account, and so
       * whether the billing portal has anything to show. The id itself
       * is destructured out above: the reader has no use for it.
       */
      hasBilling: stripeCustomerId !== null,
      counts: {
        categorias: _count.categoryFavorites,
        artigos: _count.articleFavorites,
        comentarios: _count.comments,
        historico: _count.readingHistory,
      },
    };
  }

  async updateProfile(
    readerId: string,
    dto: {
      name?: string;
      displayNamePublic?: boolean;
      notifyNewArticles?: boolean;
      digestFrequency?: 'IMEDIATO' | 'DIARIO' | 'SEMANAL' | 'NUNCA';
    },
  ) {
    await this.prisma.reader.update({
      where: { id: readerId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() || null } : {}),
        ...(dto.displayNamePublic !== undefined
          ? { displayNamePublic: dto.displayNamePublic }
          : {}),
        ...(dto.notifyNewArticles !== undefined
          ? { notifyNewArticles: dto.notifyNewArticles }
          : {}),
        ...(dto.digestFrequency !== undefined
          ? { digestFrequency: dto.digestFrequency }
          : {}),
      },
    });
    return this.getProfile(readerId);
  }

  /**
   * RGPD erasure. Anonymises rather than deletes.
   *
   * A hard delete would cascade the reader's comments away and punch holes
   * through every thread they took part in, rewriting conversations other
   * people are still reading. Scrubbing the identifying columns satisfies
   * erasure while leaving the thread intact; the UI renders these as
   * "Leitor removido". The onDelete: Cascade in the schema is a safety net
   * for a genuine row deletion, not the intended path.
   */
  async anonymise(readerId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.emailToken.deleteMany({ where: { readerId } }),
      this.prisma.readingHistory.deleteMany({ where: { readerId } }),
      this.prisma.articleFavorite.deleteMany({ where: { readerId } }),
      this.prisma.categoryFavorite.deleteMany({ where: { readerId } }),
      this.prisma.readerIdentity.deleteMany({ where: { readerId } }),
      this.prisma.articleNotification.deleteMany({ where: { readerId } }),
      this.prisma.reader.update({
        where: { id: readerId },
        data: {
          status: 'ANONIMIZADO',
          // Keep the row unique-able without keeping the address.
          email: `anonimizado+${readerId}@invalid.local`,
          name: null,
          avatarUrl: null,
          password: null,
          emailVerifiedAt: null,
          notifyNewArticles: false,
          digestFrequency: 'NUNCA',
          unsubscribeToken: randomBytes(32).toString('base64url'),
          tokenVersion: { increment: 1 },
          stripeCustomerId: null,
          // Dropping the Stripe id without dropping the plan left an
          // orphan: a deleted account still counted as a subscriber in
          // every "quantos assinantes temos" query, with no customer left
          // to bill or cancel. The two have to go together.
          plan: 'GRATIS',
          planStatus: null,
          planRenewsAt: null,
          // The suspension goes too. ANONIMIZADO already bars the account
          // on its own, and leaving a live end date behind would let a
          // lapse write ATIVO back over the anonymisation.
          suspendedUntil: null,
          suspensionReason: null,
          suspendedById: null,
        },
      }),
    ]);
    this.logger.log(`Reader ${readerId} anonymised on request.`);
  }
}
