import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { Public } from '../auth/public.decorator';
import {
  CurrentReader,
  ReaderAuth,
} from '../reader-auth/reader-auth.decorators';
import type { ReaderPrincipal } from '../reader-auth/reader-auth.guard';

@Controller()
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billing: BillingService,
    private readonly stripe: StripeService,
  ) {}

  // ── Reader ────────────────────────────────────────────────────────

  /** Starts a paid subscription. Returns the Stripe Checkout URL. */
  @ReaderAuth()
  @Post('reader/billing/checkout')
  @HttpCode(HttpStatus.OK)
  checkout(@CurrentReader() reader: ReaderPrincipal) {
    return this.billing.createCheckoutSession(reader);
  }

  /** Cancel, change card, download invoices — all on Stripe's pages. */
  @ReaderAuth()
  @Post('reader/billing/portal')
  @HttpCode(HttpStatus.OK)
  portal(@CurrentReader() reader: ReaderPrincipal) {
    return this.billing.createPortalSession(reader.id);
  }

  // ── Stripe ────────────────────────────────────────────────────────

  /**
   * The webhook.
   *
   * Three things about this route are load-bearing and none of them are
   * obvious:
   *
   *  1. `req.rawBody`, not a parsed body. Stripe signs the exact bytes it
   *     sent; anything that parses and reserialises them first breaks the
   *     signature. That is why main.ts creates the app with
   *     `rawBody: true`, and why this method takes no @Body().
   *
   *  2. @SkipThrottle(). Stripe retries with backoff after an outage and
   *     can arrive in a burst; a 429 to Stripe is a subscription that
   *     silently never gets recorded.
   *
   *  3. It answers 200 to anything it has already handled, and to events
   *     it does not care about. A non-2xx makes Stripe retry for days,
   *     so an error must be reserved for "we genuinely failed and want
   *     you to try again".
   *
   * @Public() because the caller is Stripe, not a session. The signature
   * IS the authentication — an unsigned or wrongly-signed request is
   * rejected below, before anything is read out of the body.
   */
  @Public()
  @SkipThrottle()
  @Post('public/stripe/webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!this.stripe.enabled) {
      // Not an error: a deployment with no keys is a deployment that
      // does not take money, and saying so plainly beats a 500.
      return { received: true, ignored: 'billing desligado' };
    }
    if (!signature) throw new BadRequestException('Assinatura em falta.');
    if (!req.rawBody) {
      // Would mean rawBody: true was lost in main.ts. Loud, because
      // every webhook would fail silently otherwise.
      throw new BadRequestException('Corpo do pedido não disponível.');
    }

    let event;
    try {
      event = this.stripe.constructEvent(req.rawBody, signature);
    } catch (err) {
      // 400, not 500: the request is not from Stripe, or is replayed
      // past its tolerance window. Retrying it would not help.
      this.logger.warn(`Rejected webhook: ${(err as Error).message}`);
      throw new BadRequestException('Assinatura inválida.');
    }

    const handled = await this.billing.handleEvent(event);
    return { received: true, handled };
  }
}
