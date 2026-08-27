import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

/**
 * Reader JWTs, kept cryptographically separate from staff JWTs.
 *
 * Staff tokens are signed with JWT_SECRET by AuthService and resolved
 * against the `User` table. Reader tokens are signed with a DIFFERENT
 * secret and resolved against `Reader`. Sharing one secret would leave the
 * separation resting entirely on the `typ` claim being checked in every
 * guard — one forgotten check away from full cross-audience compromise.
 * With two secrets, a forgotten check still fails signature verification.
 *
 * Note we reuse the injected JwtService (AuthModule is @Global and exports
 * JwtModule) and pass the secret explicitly per call, rather than
 * registering a second JwtModule. Registering another one resolves by
 * subtle provider-precedence rules; explicit options are greppable and
 * cannot be shadowed.
 */
export interface ReaderJwtPayload {
  /** Reader id. */
  sub: string;
  /** Audience marker. Staff tokens carry 'staff' (or nothing, pre-M10). */
  typ: 'reader';
  /** Reader.tokenVersion — a mismatch revokes the token. */
  tv: number;
}

@Injectable()
export class ReaderTokenService implements OnModuleInit {
  private readonly logger = new Logger(ReaderTokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Fail at boot rather than at first login. Mirrors the JWT_SECRET check
   * in auth.module.ts, plus the one rule that matters most here: the two
   * secrets must not be the same value, because that silently collapses
   * the strongest isolation layer into nothing.
   */
  onModuleInit(): void {
    const secret = this.config.get<string>('READER_JWT_SECRET');
    const staffSecret = this.config.get<string>('JWT_SECRET');

    if (!secret || secret.length < 32) {
      throw new Error(
        'READER_JWT_SECRET must be defined and at least 32 characters long. ' +
          'Set it in .env (see .env.example). It MUST differ from JWT_SECRET.',
      );
    }
    if (secret === staffSecret) {
      throw new Error(
        'READER_JWT_SECRET must not be the same value as JWT_SECRET. ' +
          'Reader and staff sessions are separate audiences; sharing one ' +
          'signing key means a reader token verifies as a staff token.',
      );
    }
    this.logger.log('Reader token signing key validated.');
  }

  private get secret(): string {
    // Validated in onModuleInit; the app refuses to boot otherwise.
    return this.config.get<string>('READER_JWT_SECRET')!;
  }

  private get expiresIn(): string {
    return this.config.get<string>('READER_JWT_EXPIRES_IN') ?? '30d';
  }

  /**
   * Deliberately minimal payload: no email, no name, and above all no
   * `plan`. These tokens live 30 days, so anything authorization-shaped
   * baked in here goes stale — a reader who pays in phase 2 would wait a
   * month for access. Plan and status are read from the DB on every
   * request, which the guard is doing anyway for tokenVersion.
   */
  async sign(reader: { id: string; tokenVersion: number }): Promise<string> {
    const payload: ReaderJwtPayload = {
      sub: reader.id,
      typ: 'reader',
      tv: reader.tokenVersion,
    };
    return this.jwt.signAsync(payload, {
      secret: this.secret,
      expiresIn: this.expiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });
  }

  /** Returns null on any failure — callers decide between 401 and anonymous. */
  async verify(token: string): Promise<ReaderJwtPayload | null> {
    try {
      const payload = await this.jwt.verifyAsync<ReaderJwtPayload>(token, {
        secret: this.secret,
      });
      // Defence in depth: even with a valid signature, refuse anything that
      // is not explicitly a reader token.
      if (payload.typ !== 'reader') return null;
      return payload;
    } catch {
      return null;
    }
  }
}
