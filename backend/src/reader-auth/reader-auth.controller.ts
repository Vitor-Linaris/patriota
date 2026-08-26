import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReaderAuthService } from './reader-auth.service';
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
  private readonly logger = new Logger(ReaderAuthController.name);

  constructor(private readonly auth: ReaderAuthService) {}

  /**
   * M3 replaces this with MailerService. Until the mailer lands, the link
   * is logged so the flow is testable end to end with no credentials —
   * which is also exactly what MAIL_DRIVER=log will do afterwards.
   */
  private deliver(kind: string, email: string, token: string): void {
    this.logger.log(`[${kind}] ${email} → token=${token}`);
  }

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

    if (result.alreadyRegistered) {
      this.deliver('registration-attempt', dto.email, '(no token)');
    } else if (result.verificationToken) {
      this.deliver('verify-email', dto.email, result.verificationToken);
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
    const token = await this.auth.resendVerification(dto.email);
    if (token) this.deliver('verify-email', dto.email, token);
    // 204 regardless — same non-enumeration rule as register.
  }

  @ReaderPublic()
  @Post('public/reader/forgot-password')
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() dto: EmailOnlyDto): Promise<void> {
    const token = await this.auth.forgotPassword(dto.email);
    if (token) this.deliver('reset-password', dto.email, token);
  }

  @ReaderPublic()
  @Post('public/reader/reset-password')
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto.token, dto.password);
  }
}
