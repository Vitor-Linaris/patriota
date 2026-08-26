import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import {
  OptionalReaderAuthGuard,
  ReaderAuthGuard,
  type ReaderPrincipal,
  type ReaderRequest,
} from './reader-auth.guard';
import { ReaderFeatureGuard } from './reader-feature.guard';

/**
 * Reader routes need TWO decorators to behave: @Public() to get past the
 * global JwtAuthGuard (which resolves against the staff User table and
 * would 401 every reader), and @UseGuards(ReaderAuthGuard) to do the real
 * check.
 *
 * Written separately, forgetting the second one leaves the route wide open
 * to anonymous traffic — a silent authentication bypass that no test would
 * notice unless it specifically probed that route unauthenticated. Bundled
 * here so the two cannot be separated.
 *
 * House rule: @Public() is NEVER written by hand inside the reader
 * modules. Use @ReaderAuth() or @OptionalReaderAuth(); the only exception
 * is ReaderAuthController (register/login/verify/OAuth callbacks), which
 * is anonymous by design and carries a bare @Public() with no reader guard
 * at all.
 *
 * Guard order on a decorated route:
 *   ThrottlerGuard (global) → JwtAuthGuard (global, sees @Public, passes)
 *   → RolesGuard (global, no metadata, passes) → ReaderFeatureGuard
 *   → ReaderAuthGuard
 */
export const ReaderAuth = () =>
  applyDecorators(Public(), UseGuards(ReaderFeatureGuard, ReaderAuthGuard));

/**
 * As above, but anonymous callers are allowed through with no principal.
 * For public endpoints whose response varies for a logged-in reader.
 */
export const OptionalReaderAuth = () =>
  applyDecorators(
    Public(),
    UseGuards(ReaderFeatureGuard, OptionalReaderAuthGuard),
  );

/**
 * Anonymous reader endpoint (register, login, verify, reset, OAuth).
 * Still behind the feature flag, but with no session requirement.
 */
export const ReaderPublic = () =>
  applyDecorators(Public(), UseGuards(ReaderFeatureGuard));

/**
 * The reader principal, from `req.reader`.
 *
 * Separate from @CurrentUser() (which reads `req.user` and returns staff)
 * on purpose — see the note in reader-auth.guard.ts. Undefined under
 * @OptionalReaderAuth() when the caller is anonymous.
 */
export const CurrentReader = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ReaderPrincipal | undefined => {
    return ctx.switchToHttp().getRequest<ReaderRequest>().reader;
  },
);
