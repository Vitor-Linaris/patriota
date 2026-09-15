import {
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { OAuthStateStore, STATE_TTL_SECONDS } from './oauth-state.store';
import { setBindingCookie } from './oauth-binding.cookie';
import { OAuthService } from './oauth.service';
import type { ReaderAuthProvider } from '../../../generated/prisma/enums';

/** `oauthState` is minted by the guard on the initiate leg. */
export type OAuthRequest = Request & { oauthState?: string };

/** Same-origin paths only. `//evil.com` is not one. */
export function safeNext(next: unknown): string {
  return typeof next === 'string' && /^\/(?!\/)/.test(next) ? next : '/conta';
}

/**
 * Runs before passport, on the initiate leg only.
 *
 * Both of these have to happen HERE rather than in the controller
 * handler, because passport ends the initiate request with a 302 and the
 * handler body never executes:
 *
 *   • the config check — otherwise an unconfigured deployment redirects
 *     readers to Google with `client_id=not-configured`;
 *   • minting the state AND setting its binding cookie — state assigned
 *     in the handler would always be undefined, i.e. no CSRF protection
 *     at all, silently, and the cookie has to go out on the same 302
 *     that leaves for the provider.
 *
 * Passport's own state handling is unusable here: it needs an express
 * session, which this app does not run. Ours lives in Redis and also
 * carries the `next` path, which cannot ride in the URL because the
 * provider echoes back only what we sent.
 */
async function prepareInitiate(
  context: ExecutionContext,
  state: OAuthStateStore,
  provider: ReaderAuthProvider,
): Promise<void> {
  const req = context.switchToHttp().getRequest<OAuthRequest>();

  // The callback leg carries state back from the provider; only the
  // initiate leg mints one.
  if (req.path.endsWith('/callback')) return;

  if (!OAuthService.configured().includes(provider)) {
    // 404, not 500: an unconfigured provider should look like a route
    // that does not exist, not a broken one.
    throw new NotFoundException();
  }

  const issued = await state.issueState(safeNext(req.query.next));
  req.oauthState = issued.state;
  // The half that stays in THIS browser. Without it the state proves
  // only that somebody started a flow, not that this browser did.
  setBindingCookie(
    req,
    context.switchToHttp().getResponse<Response>(),
    issued.binding,
    STATE_TTL_SECONDS,
  );
}

/**
 * Passport throws on ANY failure of the callback leg: a denied consent
 * screen, an expired code, a provider outage, a forged state. Thrown, it
 * surfaces as a raw 500 on a page the reader reached by clicking a
 * button.
 *
 * Returning the (possibly undefined) user instead lets the request reach
 * the controller, where finish() turns a missing profile into a redirect
 * to the error card. The state check there is what actually rejects
 * forged callbacks — this only decides how the rejection LOOKS.
 */
function passThroughFailure<TUser>(user: TUser): TUser {
  return user;
}

function authenticateOptions(context: ExecutionContext) {
  const req = context.switchToHttp().getRequest<OAuthRequest>();
  return { state: req.oauthState };
}

/*
 * Two explicit classes rather than a factory: AuthGuard is itself a
 * class factory, and Nest resolves constructor dependencies from the
 * concrete class's own metadata. Wrapping it in a second factory saves
 * a dozen lines and costs a decorator-on-dynamic-class puzzle that
 * fails at runtime, not compile time.
 */

@Injectable()
export class GoogleOAuthGuard extends AuthGuard('reader-google') {
  constructor(private readonly state: OAuthStateStore) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await prepareInitiate(context, this.state, 'GOOGLE');
    return (await super.canActivate(context)) as boolean;
  }

  getAuthenticateOptions(context: ExecutionContext) {
    return authenticateOptions(context);
  }

  handleRequest<TUser>(_err: unknown, user: TUser): TUser {
    return passThroughFailure(user);
  }
}

@Injectable()
export class FacebookOAuthGuard extends AuthGuard('reader-facebook') {
  constructor(private readonly state: OAuthStateStore) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await prepareInitiate(context, this.state, 'FACEBOOK');
    return (await super.canActivate(context)) as boolean;
  }

  getAuthenticateOptions(context: ExecutionContext) {
    return authenticateOptions(context);
  }

  handleRequest<TUser>(_err: unknown, user: TUser): TUser {
    return passThroughFailure(user);
  }
}
