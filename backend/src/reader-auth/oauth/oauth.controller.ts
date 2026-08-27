import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ReaderPublic } from '../reader-auth.decorators';
import { OAuthService, type OAuthProfile } from './oauth.service';
import { OAuthStateStore } from './oauth-state.store';
import {
  FacebookOAuthGuard,
  GoogleOAuthGuard,
  type OAuthRequest,
} from './oauth.guards';
import { ExchangeCodeDto } from './dto/exchange.dto';

/**
 * Social login.
 *
 * Flow, and why it has this shape:
 *
 *   1. GET  /public/reader/auth/<provider>
 *      Mints a state in Redis carrying the `next` path, then lets
 *      passport redirect to the provider.
 *
 *   2. GET  /public/reader/auth/<provider>/callback
 *      Passport exchanges the code and hands back a normalised profile.
 *      We verify the state (single use), resolve the reader, then park
 *      the session token in Redis behind a ONE-TIME CODE and redirect
 *      with only that code.
 *
 *   3. POST /public/reader/auth/exchange
 *      The frontend trades the code for the token, server side, and
 *      writes the httpOnly cookie.
 *
 * Step 3 exists because a JWT in a redirect URL ends up in browser
 * history, in the Referer header of every subsequent request, and in the
 * access log of every proxy in between. The code is worthless 60 seconds
 * later and can only be spent once.
 */
@Controller()
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauth: OAuthService,
    private readonly state: OAuthStateStore,
  ) {}

  private get successRedirect(): string {
    return (
      process.env.OAUTH_SUCCESS_REDIRECT ?? 'http://localhost:3005/conta/oauth'
    ).replace(/\/+$/, '');
  }

  /**
   * Which providers the login page should offer.
   *
   * Single source of truth: the backend knows whether credentials are
   * actually present, so the frontend never needs a parallel set of
   * NEXT_PUBLIC_ flags that can drift out of sync with reality.
   */
  @ReaderPublic()
  @Get('public/reader/auth/providers')
  providers() {
    return { providers: OAuthService.configured() };
  }

  // ── Google ──────────────────────────────────────────────────────────
  /**
   * Never actually runs: GoogleOAuthGuard ends the request with a 302 to
   * Google. It exists so the route is registered, and so the guard has
   * somewhere to hang.
   */
  @ReaderPublic()
  @Get('public/reader/auth/google')
  @UseGuards(GoogleOAuthGuard)
  google(): void {}

  @ReaderPublic()
  @Get('public/reader/auth/google/callback')
  @UseGuards(GoogleOAuthGuard)
  googleCallback(@Req() req: OAuthRequest, @Res() res: Response) {
    return this.finish(req, res);
  }

  // ── Facebook ────────────────────────────────────────────────────────
  /** Same as google() — the guard redirects before this is reached. */
  @ReaderPublic()
  @Get('public/reader/auth/facebook')
  @UseGuards(FacebookOAuthGuard)
  facebook(): void {}

  @ReaderPublic()
  @Get('public/reader/auth/facebook/callback')
  @UseGuards(FacebookOAuthGuard)
  facebookCallback(@Req() req: OAuthRequest, @Res() res: Response) {
    return this.finish(req, res);
  }

  // ── Shared callback tail ────────────────────────────────────────────

  /**
   * NOTE: the callback query is deliberately NOT bound to a validated
   * DTO. The global ValidationPipe runs with forbidNonWhitelisted, and
   * Google appends `authuser`, `prompt` and `scope` of its own — a DTO
   * would reject every real callback with a 400.
   */
  private async finish(req: OAuthRequest, res: Response): Promise<void> {
    const failure = (reason: string) => {
      this.logger.warn(`OAuth callback rejected: ${reason}`);
      res.redirect(`${this.successRedirect}?erro=1`);
    };

    // Passport puts the strategy result on req.user. Move it off
    // immediately: req.user is the STAFF principal everywhere else in
    // this app, and leaving a reader-shaped object there would make
    // @CurrentUser() hand callers something that only looks like an
    // AuthUser.
    const profile = req.user as OAuthProfile | undefined;
    delete (req as { user?: unknown }).user;

    if (!profile) return failure('no profile from provider');

    const state = await this.state.consumeState(
      typeof req.query.state === 'string' ? req.query.state : undefined,
    );
    // A missing or already-spent state means this callback was not
    // started by us. Without this check an attacker can complete their
    // own authorization and hand the victim the resulting URL, logging
    // the victim into the attacker's account.
    if (!state) return failure('invalid or replayed state');

    try {
      const { accessToken } = await this.oauth.signIn(profile);
      const code = await this.state.issueCode(accessToken);
      const next = encodeURIComponent(state.next);
      res.redirect(`${this.successRedirect}?code=${code}&next=${next}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.redirect(
        `${this.successRedirect}?erro=${encodeURIComponent(message)}`,
      );
    }
  }

  /**
   * Spends the one-time code. Called server-side by the frontend, which
   * then sets the httpOnly cookie — the token never touches the browser
   * URL bar.
   */
  @ReaderPublic()
  @Post('public/reader/auth/exchange')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  async exchange(@Body() dto: ExchangeCodeDto) {
    const accessToken = await this.state.consumeCode(dto.code);
    if (!accessToken) {
      throw new NotFoundException('Código inválido ou expirado.');
    }
    return { accessToken };
  }
}
