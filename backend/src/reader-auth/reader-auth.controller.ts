import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReaderAuthService } from './reader-auth.service';
import { ReaderMailService } from './reader-mail.service';
import { ReaderPublic } from './reader-auth.decorators';
import { RegisterDto } from './dto/register.dto';
import { ReaderLoginDto } from './dto/login.dto';
import { EmailOnlyDto } from './dto/email-only.dto';
import { ResetPasswordDto, VerifyEmailDto } from './dto/token.dto';

/**
 * Anonymous reader endpoints.
 *
 * Every handler carries @ReaderPublic() — the feature flag, without any
 * session requirement. This is the ONE controller in the reader modules
 * allowed to be session-less; everything else uses @ReaderAuth().
 *
 * The throttle limits here are the real defence on these routes, which is
 * why M0 had to fix `trust proxy` first: without it every caller shared
 * one bucket and these numbers meant nothing.
 */
@Controller()
export class ReaderAuthController {
  constructor(
    private readonly auth: ReaderAuthService,
    private readonly mail: ReaderMailService,
  ) {}

  /**
   * Always 202, whether or not the address was free.
   *
   * Returning 409 on a taken address would let anyone enumerate the
   * readership one request at a time. The real owner is not left guessing
   * either: they get a "someone tried to register with your address" mail.
   */
  @ReaderPublic()
  @Post('public/reader/register')
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Body() dto: RegisterDto) {
    const result = await this.auth.register(dto);

    // Both branches send mail, and both return the same 202 — that is the
    // whole point. The address owner learns something either way; a
    // stranger probing for accounts learns nothing.
    if (result.alreadyRegistered) {
      await this.mail.sendRegistrationAttempt(
        dto.email,
        result.name,
        result.hasPassword,
      );
    } else if (result.verificationToken) {
      await this.mail.sendVerification(
        dto.email,
        result.name,
        result.verificationToken,
      );
    }

    return {
      message:
        'Se o endereço estiver disponível, enviámos uma ligação de confirmação. Verifique o seu e-mail.',
    };
  }

  @ReaderPublic()
  @Post('public/reader/login')
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: ReaderLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  /** Consumes the link and returns a session, so the reader lands logged in. */
  @ReaderPublic()
  @Post('public/reader/verify-email')
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @ReaderPublic()
  @Post('public/reader/resend-verification')
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendVerification(@Body() dto: EmailOnlyDto): Promise<void> {
    const issued = await this.auth.resendVerification(dto.email);
    if (issued) {
      await this.mail.sendVerification(dto.email, issued.name, issued.token);
    }
    // 204 regardless — same non-enumeration rule as register.
  }

  @ReaderPublic()
  @Post('public/reader/forgot-password')
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() dto: EmailOnlyDto): Promise<void> {
    const issued = await this.auth.forgotPassword(dto.email);
    if (issued) {
      await this.mail.sendPasswordReset(
        dto.email,
        issued.name,
        issued.token,
        issued.firstPassword,
      );
    }
    // 204 whether or not an account exists.
  }

  @ReaderPublic()
  @Post('public/reader/reset-password')
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto.token, dto.password);
  }
}
