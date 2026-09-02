import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { BillingController } from './billing.controller';
import { ReaderAuthModule } from '../reader-auth/reader-auth.module';

/**
 * Stripe subscriptions.
 *
 * Registered unconditionally, like every other reader module: the e2e
 * suite builds the whole graph, and StripeService decides at call time
 * whether this deployment has keys. A module that refused to load
 * without them would take every unrelated test down with it.
 */
@Module({
  imports: [ReaderAuthModule],
  providers: [BillingService, StripeService],
  controllers: [BillingController],
  exports: [BillingService, StripeService],
})
export class BillingModule {}
