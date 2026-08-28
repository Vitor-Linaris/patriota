import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-facebook';
import type { OAuthProfile } from './oauth.service';

/**
 * Facebook Login.
 *
 * Same placeholder-credentials and stateless notes as the Google
 * strategy.
 *
 * `emailVerified: true` here is NOT a claim that Facebook verified the
 * address — it does not tell us. It means "good enough to create a
 * brand-new account with", since whoever completed this flow controls
 * the Facebook account that holds it. It is deliberately NOT enough to
 * join this identity to a pre-existing local account:
 * OAuthService.mayAutoLink ignores this flag for Facebook and refuses
 * outright whenever the local account has a password.
 *
 * Requesting `email` in production needs Meta's App Review.
 */
@Injectable()
export class FacebookOAuthStrategy extends PassportStrategy(
  Strategy,
  'reader-facebook',
) {
  constructor() {
    super({
      clientID: process.env.FACEBOOK_APP_ID || 'not-configured',
      clientSecret: process.env.FACEBOOK_APP_SECRET || 'not-configured',
      callbackURL:
        process.env.FACEBOOK_CALLBACK_URL ??
        'http://localhost:8585/public/reader/auth/facebook/callback',
      // passport-facebook defaults to v3.2 — October 2018 — for the
      // dialog, the token exchange AND the profile fetch. Meta keeps
      // answering calls to versions it no longer supports by routing
      // them to the oldest one it does, which means the behaviour of a
      // login that is pinned to nothing drifts on Meta's schedule, not
      // ours. Pinned explicitly, and overridable, so the day this needs
      // to move it is an env var and not a deploy.
      graphAPIVersion: process.env.FACEBOOK_GRAPH_VERSION ?? 'v21.0',
      scope: ['email'],
      profileFields: ['id', 'emails', 'name', 'displayName', 'picture.type(large)'],
      state: false,
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: unknown, user?: OAuthProfile) => void,
  ): void {
    const name =
      profile.displayName ||
      [profile.name?.givenName, profile.name?.familyName]
        .filter(Boolean)
        .join(' ') ||
      null;

    const normalised: OAuthProfile = {
      provider: 'FACEBOOK',
      providerAccountId: profile.id,
      email: profile.emails?.[0]?.value ?? null,
      emailVerified: true,
      name,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };

    done(null, normalised);
  }
}
