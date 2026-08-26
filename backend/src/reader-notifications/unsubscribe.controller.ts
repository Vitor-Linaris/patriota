import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { ReaderNotificationsService } from './reader-notifications.service';
import { UnsubscribeDto, UnsubscribeQueryDto } from './dto/unsubscribe.dto';

/**
 * One-click unsubscribe from the digest e-mails.
 *
 * Session-less by necessity: RFC 8058 requires the List-Unsubscribe
 * target to work with no cookie and no CSRF token, which is exactly why
 * authorisation here is the reader's crypto-random unsubscribeToken (32
 * random bytes, no @default(cuid()) in the schema) rather than a session.
 *
 * NOT behind ReaderFeatureGuard: if the reader area is switched off after
 * digests have gone out, those links must still work. Nobody should be
 * unable to unsubscribe because a flag changed.
 */
@Controller()
export class UnsubscribeController {
  constructor(private readonly notifications: ReaderNotificationsService) {}

  /**
   * Describes what the token would act on, so the frontend can render a
   * confirmation. Read-only on purpose — see the POST below.
   */
  @Public()
  @Get('public/reader/unsubscribe')
  @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
  describe(@Query() query: UnsubscribeQueryDto) {
    return this.notifications.describeUnsubscribe(query.t);
  }

  /**
   * Performs it.
   *
   * POST, never GET. Mail clients and corporate link scanners prefetch
   * GET URLs, so a mutating GET would silently unsubscribe readers who
   * never clicked anything — and the reader would have no idea why the
   * e-mails stopped.
   */
  @Public()
  @Post('public/reader/unsubscribe')
  @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
  @HttpCode(HttpStatus.OK)
  unsubscribe(@Body() dto: UnsubscribeDto) {
    return this.notifications.unsubscribe(dto.token, {
      categoryId: dto.categoryId,
      all: dto.all,
    });
  }
}
