import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';
import type { OAuthProfile } from './oauth.service';

/**
 * Google Sign-In.
 *
 * `state: false` on purpose — passport's own state handling needs an
 * express session, which this app does not have. We mint and verify the
 * state ourselves in OAuthStateStore (Redis), which also lets it carry
 * the `next` path.
 *
 * The placeholder credentials matter: passport-google-oauth20 throws
 * from its constructor on an empty clientID, which would take the whole
 * app down on any deployment that has not configured Google. The route
 * that uses this strategy 404s unless OAuthService.configured() lists
 * the provider, so the placeholder is never actually sent anywhere.
 */
@Injectable()
export class GoogleOAuthStrategy extends PassportStrategy(
  Strategy,
  'reader-google',
) {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'not-configured',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'not-configured',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ??
        'http://localhost:8585/public/reader/auth/google/callback',
      scope: ['email', 'profile'],
      state: false,
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const json = profile._json as { email_verified?: boolean };

    const normalised: OAuthProfile = {
      provider: 'GOOGLE',
      providerAccountId: profile.id,
      email: profile.emails?.[0]?.value ?? null,
      // Google is explicit about this, and OAuthService.mayAutoLink
      // requires it to be true before joining a Google identity to an
      // account that already exists.
      emailVerified: json.email_verified === true,
      name: profile.displayName || null,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };

    done(null, normalised);
  }
}
