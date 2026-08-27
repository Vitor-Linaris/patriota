import {
  CanActivate,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Server-side kill switch for the whole reader area.
 *
 * The frontend's NEXT_PUBLIC_FEATURE_* flags are inlined into the browser
 * bundle and protect nothing — the API answers on :8585 directly. So the
 * backend needs its own flag, and it must not carry the NEXT_PUBLIC_
 * prefix or it would be shipped to clients.
 *
 * Throws 404 rather than 403 so a disabled deployment does not advertise
 * that the endpoints exist.
 *
 * Applied at class level on every reader/comment controller. Registering
 * the modules conditionally in AppModule would be tidier, but it breaks
 * e2e (the test app builds the full module graph); a guard is testable.
 */
@Injectable()
export class ReaderFeatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get<string>('FEATURE_READER_AREA') !== 'true') {
      throw new NotFoundException();
    }
    return true;
  }
}
