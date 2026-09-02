import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ReaderTokenService } from './reader-token.service';
import {
  isSuspended,
  lapseData,
  suspensionLapsed,
  suspensionMessage,
} from './reader-suspension';
import {
  effectivePlan,
  lapsedPlanData,
  planLapsed,
} from './reader-entitlement';

/**
 * The authenticated principal for a public reader. Intentionally NOT
 * shaped like AuthUser: it has no `role`, because a reader has none.
 */
export interface ReaderPrincipal {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  /**
   * The EFFECTIVE plan — already downgraded to GRATIS if the
   * subscription's end date has passed.
   *
   * Downgrading here rather than at each call site is the point: a
   * lapsed subscription is indistinguishable from never having had one,
   * and nothing downstream has to remember to check a date. See
   * reader-entitlement.ts.
   */
  plan: string;
  displayNamePublic: boolean;
}

/**
 * Request augmented with the reader principal. Never `user` — see below.
 *
 * `readerSuspension` is how resolve() tells canActivate() WHY it refused.
 * Both outcomes are `null` from resolve()'s point of view, but a banned
 * reader deserves to be told they are banned and until when, while a
 * stale token deserves nothing more than "sessão inválida". The marker
 * keeps that distinction without making resolve() throw, which would
 * break OptionalReaderAuthGuard's contract that anonymous is fine.
 */
export type ReaderRequest = Request & {
  reader?: ReaderPrincipal;
  readerSuspension?: { suspendedUntil: Date | null; suspensionReason: string | null };
};

/**
 * Resolves a reader bearer token.
 *
 * Applied per-controller through @ReaderAuth(), never as an APP_GUARD: the
 * two global guards (JwtAuthGuard, RolesGuard) already run first and are
 * waved through by the @Public() that @ReaderAuth() bundles in.
 *
 * The principal is attached to `req.reader`, NOT `req.user`. Writing to
 * `req.user` would make @CurrentUser() hand callers a Reader disguised as
 * an AuthUser, and would make any future @RequirePermissions() on a reader
 * route throw a 500 out of RolesGuard (getPermissionsForRole(undefined))
 * instead of a clean 403. Passport writes req.user by default, so the
 * OAuth callbacks in M9 must move it off there explicitly.
 */
@Injectable()
export class ReaderAuthGuard implements CanActivate {
  constructor(
    protected readonly tokens: ReaderTokenService,
    protected readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ReaderRequest>();
    const principal = await this.resolve(req);
    if (!principal) {
      if (req.readerSuspension) {
        throw new ForbiddenException(suspensionMessage(req.readerSuspension));
      }
      throw new UnauthorizedException('Sessão inválida.');
    }
    req.reader = principal;
    return true;
  }

  /** Shared with OptionalReaderAuthGuard. Returns null instead of throwing. */
  protected async resolve(req: ReaderRequest): Promise<ReaderPrincipal | null> {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;

    const payload = await this.tokens.verify(auth.slice('Bearer '.length).trim());
    if (!payload) return null;

    const reader = await this.prisma.reader.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
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
    if (!reader) return null;

    // Revocation without server-side sessions: a password change, a reset
    // or "terminar todas as sessões" bumps tokenVersion, which strands
    // every token already in the wild.
    if (reader.tokenVersion !== payload.tv) return null;

    // SUSPENDED and ANONYMISED readers hold valid signatures but no access.
    // PENDENTE_VERIFICACAO deliberately DOES authenticate — they need to be
    // able to reach /reader/me and re-request the verification email. Write
    // endpoints check emailVerified separately.
    if (reader.status === 'ANONIMIZADO') return null;

    if (isSuspended(reader)) {
      req.readerSuspension = reader;
      return null;
    }

    // The ban ended. isSuspended() has already let them through on the
    // date alone — this only tidies the row so the admin list stops
    // showing a SUSPENSO next to an end date from last month. Fire and
    // forget: if it fails, the next request lets them in just the same.
    if (suspensionLapsed(reader)) {
      void this.prisma.reader
        .update({ where: { id: reader.id }, data: lapseData(reader) })
        .catch(() => undefined);
    }

    // Same treatment for an expired subscription, and for the same
    // reason: the date below has already decided the answer, this only
    // stops the row from claiming a plan that ended. Fire and forget.
    if (planLapsed(reader)) {
      void this.prisma.reader
        .update({ where: { id: reader.id }, data: lapsedPlanData() })
        .catch(() => undefined);
    }

    return {
      id: reader.id,
      email: reader.email,
      name: reader.name,
      avatarUrl: reader.avatarUrl,
      emailVerified: reader.emailVerifiedAt !== null,
      plan: effectivePlan(reader),
      displayNamePublic: reader.displayNamePublic,
    };
  }
}

/**
 * Same resolution, but anonymous is a valid outcome.
 *
 * Crucially an INVALID token also returns true (with no principal) rather
 * than 401. These cookies live 30 days; a stale one must not break a
 * public article page for a logged-out visitor.
 *
 * Used only where per-reader state changes what a public endpoint returns —
 * today just the comment thread, so a reader can see their own comment
 * while it is still PENDENTE.
 */
@Injectable()
export class OptionalReaderAuthGuard extends ReaderAuthGuard {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ReaderRequest>();
    const principal = await this.resolve(req);
    if (principal) req.reader = principal;
    return true;
  }
}
