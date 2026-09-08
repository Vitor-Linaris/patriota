import { Module } from '@nestjs/common';
import { PackagesService } from './packages.service';
import { PackagePurchasesService } from './package-purchases.service';
import { PackageStripeService } from './package-stripe.service';
import { PackagesController } from './packages.controller';
import { PackageAccessModule } from './package-access.module';
import { StripeModule } from '../billing/stripe.module';
import { ArticlesModule } from '../articles/articles.module';
import { ReaderAuthModule } from '../reader-auth/reader-auth.module';

/**
 * Pacotes exclusivos: sets of articles sold for one payment.
 *
 * Import shape, and why each one is the direction it is:
 *   - ArticlesModule — publishing a pacote publishes the drafts inside it,
 *     through the ordinary ArticlesService.publish() rather than a raw
 *     status write, so slug validation, media promotion, the activity log
 *     and the notification fan-out all happen exactly as they do on a
 *     normal publish.
 *   - PackageAccessModule — the gate, which ArticlesModule ALSO imports.
 *     That is the whole reason it is a separate leaf module: if the gate
 *     lived here, Articles needing it and this needing Articles would be a
 *     cycle.
 *   - StripeModule — the client, shared with BillingModule for the same
 *     reason.
 *
 * BillingModule imports THIS one (its webhook dispatches pacote events to
 * PackagePurchasesService), never the other way round.
 */
@Module({
  imports: [
    ArticlesModule,
    PackageAccessModule,
    StripeModule,
    ReaderAuthModule,
  ],
  providers: [PackagesService, PackagePurchasesService, PackageStripeService],
  controllers: [PackagesController],
  exports: [PackagePurchasesService],
})
export class PackagesModule {}
