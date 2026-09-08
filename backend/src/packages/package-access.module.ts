import { Module } from '@nestjs/common';
import { PackageAccessService } from './package-access.service';

/**
 * The pacote read-gate on its own, split off from PackagesModule to keep
 * the graph a tree.
 *
 * Two real dependencies pull in opposite directions: ArticlesService needs
 * the gate (findPublicBySlug asks "did this reader buy it?"), and
 * PackagesService needs ArticlesService (publishing a pacote publishes the
 * drafts inside it, through the ordinary article publish path). Those two
 * together are a cycle.
 *
 * This module breaks it by being a leaf: it depends on nothing but Prisma,
 * so ArticlesModule can import it without importing anything that imports
 * ArticlesModule back. Same trick, same reason, as StripeModule.
 */
@Module({
  providers: [PackageAccessService],
  exports: [PackageAccessService],
})
export class PackageAccessModule {}
