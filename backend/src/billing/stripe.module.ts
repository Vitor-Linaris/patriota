import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';

/**
 * The Stripe client on its own, so more than one feature can charge.
 *
 * Extracted from BillingModule when pacotes arrived: subscriptions and
 * one-off pacote purchases both need the client, and BillingModule has
 * to import PackagesModule (its webhook dispatches pacote events). Had
 * StripeService stayed inside BillingModule, PackagesModule importing it
 * back for the client would have closed a cycle and needed forwardRef.
 * A leaf module the two of them share costs nothing and keeps the graph
 * a tree.
 */
@Module({
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
