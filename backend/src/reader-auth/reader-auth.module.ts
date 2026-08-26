import { Module } from '@nestjs/common';
import { ReaderAuthService } from './reader-auth.service';
import { ReaderTokenService } from './reader-token.service';
import { ReaderAuthController } from './reader-auth.controller';
import { ReaderAccountController } from './reader-account.controller';
import { ReaderAuthGuard, OptionalReaderAuthGuard } from './reader-auth.guard';
import { ReaderFeatureGuard } from './reader-feature.guard';

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
  providers: [
    ReaderAuthService,
    ReaderTokenService,
    ReaderAuthGuard,
    OptionalReaderAuthGuard,
    ReaderFeatureGuard,
  ],
  controllers: [ReaderAuthController, ReaderAccountController],
  exports: [
    ReaderAuthService,
    ReaderTokenService,
    ReaderAuthGuard,
    OptionalReaderAuthGuard,
    ReaderFeatureGuard,
  ],
})
export class ReaderAuthModule {}
