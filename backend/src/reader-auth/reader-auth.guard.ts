import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ReaderTokenService } from './reader-token.service';

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
  /** Phase 2 reads this; today it is always GRATIS. */
  plan: string;
  displayNamePublic: boolean;
}

/** Request augmented with the reader principal. Never `user` — see below. */
export type ReaderRequest = Request & { reader?: ReaderPrincipal };

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
    if (!principal) throw new UnauthorizedException('Sessão inválida.');
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
        plan: true,
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
    if (reader.status === 'SUSPENSO' || reader.status === 'ANONIMIZADO') {
      return null;
    }

    return {
      id: reader.id,
      email: reader.email,
      name: reader.name,
      avatarUrl: reader.avatarUrl,
      emailVerified: reader.emailVerifiedAt !== null,
      plan: reader.plan,
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
