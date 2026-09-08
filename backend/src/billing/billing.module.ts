import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { StripeModule } from './stripe.module';
import { BillingController } from './billing.controller';
import { ReaderAuthModule } from '../reader-auth/reader-auth.module';
import { PackagesModule } from '../packages/packages.module';

/**
 * Stripe subscriptions.
 *
 * Registered unconditionally, like every other reader module: the e2e
 * suite builds the whole graph, and StripeService decides at call time
 * whether this deployment has keys. A module that refused to load
 * without them would take every unrelated test down with it.
 */
@Module({
  imports: [
    ReaderAuthModule,
    StripeModule,
    // The webhook is ONE endpoint for the whole account, and a one-off
    // pacote payment arrives on the same `checkout.session.completed` as a
    // subscription. So this module dispatches to pacotes rather than
    // pacotes owning a second webhook route — one signature check, one
    // idempotency ledger, one place that decides what an event meant.
    //
    // One direction only: PackagesModule does not import this.
    PackagesModule,
  ],
  providers: [BillingService],
  controllers: [BillingController],
  // StripeModule is RE-EXPORTED (not StripeService, which is no longer a
  // provider here) so anything already importing BillingModule for the
  // client keeps resolving it after the extraction.
  exports: [BillingService, StripeModule],
})
export class BillingModule {}
