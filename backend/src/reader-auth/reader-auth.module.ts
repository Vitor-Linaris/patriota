import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ReaderAuthService } from './reader-auth.service';
import { ReaderMailService } from './reader-mail.service';
import { ReaderTokenService } from './reader-token.service';
import { ReaderAuthController } from './reader-auth.controller';
import { ReaderAccountController } from './reader-account.controller';
import { ReaderAuthGuard, OptionalReaderAuthGuard } from './reader-auth.guard';
import { ReaderFeatureGuard } from './reader-feature.guard';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { OAuthStateStore } from './oauth/oauth-state.store';
import { GoogleOAuthStrategy } from './oauth/google.strategy';
import { FacebookOAuthStrategy } from './oauth/facebook.strategy';

/**
 * Public-audience authentication.
 *
 * Imports nothing: PrismaModule is registered once in AppModule and
 * AuthModule is @Global(), so JwtService and ConfigService are already
 * available. Note the guards are exported but deliberately NOT registered
 * as APP_GUARD — they are applied per-controller through @ReaderAuth(),
 * because making them global would force every staff route to opt out.
 */
@Module({
  // No session support: OAuth state lives in Redis (OAuthStateStore), so
  // passport never needs one. Registering it stateless also keeps
  // req.user from being repopulated on later requests.
  imports: [PassportModule.register({ session: false })],
  providers: [
    ReaderAuthService,
    ReaderMailService,
    ReaderTokenService,
    ReaderAuthGuard,
    OptionalReaderAuthGuard,
    ReaderFeatureGuard,
    OAuthService,
    OAuthStateStore,
    GoogleOAuthStrategy,
    FacebookOAuthStrategy,
  ],
  controllers: [ReaderAuthController, ReaderAccountController, OAuthController],
  exports: [
    ReaderAuthService,
    ReaderTokenService,
    ReaderAuthGuard,
    OptionalReaderAuthGuard,
    ReaderFeatureGuard,
  ],
})
export class ReaderAuthModule {}
