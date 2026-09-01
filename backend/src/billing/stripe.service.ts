import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * The Stripe client, and the decision of whether billing exists at all.
 *
 * There is no separate FEATURE_BILLING flag: the presence of
 * STRIPE_SECRET_KEY *is* the flag. A flag that can disagree with the
 * configuration is a way to get a deployment that thinks it can charge
 * people and cannot, or the reverse — and this is the one part of the
 * system where "half on" costs real money.
 *
 * Keys live in the environment only, never in Setting. GET
 * /admin/settings hands the whole JSON blob to anyone with
 * configuracoes.aceder, which is not a place to keep something that can
 * move money.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private client: Stripe | null = null;

  constructor(private readonly config: ConfigService) {}

  /** True when this deployment can actually take money. */
  get enabled(): boolean {
    return Boolean(this.config.get<string>('STRIPE_SECRET_KEY'));
  }

  get priceId(): string | undefined {
    return this.config.get<string>('STRIPE_PRICE_ID');
  }

  get webhookSecret(): string | undefined {
    return this.config.get<string>('STRIPE_WEBHOOK_SECRET');
  }

  /**
   * Built once, lazily.
   *
   * Lazily so the module can be registered unconditionally — e2e builds
   * the whole graph, and a constructor that threw without keys would
   * make every unrelated test suite fail to boot.
   */
  get stripe(): Stripe {
    if (!this.client) {
      const key = this.config.get<string>('STRIPE_SECRET_KEY');
      if (!key) {
        throw new ServiceUnavailableException(
          'Os pagamentos não estão configurados neste servidor.',
        );
      }
      this.client = new Stripe(key, {
        // Pinned. Stripe changes response shapes between versions, and
        // an implicit "latest" means the next account-level upgrade
        // silently reshapes what the webhook handler reads.
        apiVersion: '2026-08-26.dahlia',
        appInfo: { name: 'O Patriota Notícias' },
        // Money is worth waiting a little longer for, and worth retrying:
        // a network blip on a checkout call is a lost subscriber.
        timeout: 20_000,
        maxNetworkRetries: 2,
      });
      this.logger.log('Stripe client ready.');
    }
    return this.client;
  }

  /**
   * Verifies a webhook came from Stripe.
   *
   * Needs the EXACT bytes Stripe signed. Anything that reparses or
   * reserialises the body first — the global ValidationPipe, a JSON
   * body parser — changes them and the signature stops matching, which
   * is why the route takes a Buffer and skips both.
   */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const secret = this.webhookSecret;
    if (!secret) {
      throw new ServiceUnavailableException(
        'STRIPE_WEBHOOK_SECRET não está configurado.',
      );
    }
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }
}
