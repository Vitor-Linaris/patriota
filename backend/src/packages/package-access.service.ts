import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { subscriptionExcluded } from './package-access';

/**
 * The two queries the article paywall gained when pacotes arrived.
 *
 * Kept in their own service, injected into ArticlesService, so the gate
 * in findPublicBySlug stays four readable lines and this file can be
 * mocked wholesale in the articles tests.
 *
 * Both are deliberately narrow. This runs on the article page — the
 * hottest read path on the site — and neither method is allowed to grow
 * a join that is not paid for by an index.
 */
@Injectable()
export class PackageAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Does pacote membership take this article off the subscription?
   *
   * One query, on @@index([articleId]) of PackageArticle. Filtered to
   * PUBLICADO pacotes in the WHERE rather than after the fact: a draft
   * pacote must never be able to lock a live article, and enforcing it
   * here means the pure rule cannot be called with the wrong rows.
   */
  async isSubscriptionExcluded(articleId: string): Promise<boolean> {
    const rows = await this.prisma.packageArticle.findMany({
      where: { articleId, package: { status: 'PUBLICADO' } },
      select: { package: { select: { includedInSubscription: true } } },
    });
    return subscriptionExcluded(rows.map((r) => r.package));
  }

  /**
   * Has this reader paid for this article, through any pacote?
   *
   * One index-only lookup on @@index([readerId, articleId]) — which is
   * why readerId is denormalised onto PackagePurchaseItem instead of
   * being reached through a join to PackagePurchase.
   *
   * Nothing here consults Package.status or the purchase row: revoking is
   * a DELETE of these rows, so their mere existence is the answer. A
   * pacote later unpublished still grants what somebody paid for, which
   * is correct — they paid.
   */
  async hasPurchased(readerId: string, articleId: string): Promise<boolean> {
    const hit = await this.prisma.packagePurchaseItem.findFirst({
      where: { readerId, articleId },
      select: { purchaseId: true },
    });
    return hit !== null;
  }

  /**
   * The same question for a whole pacote, for the detail page's CTA.
   *
   * "Owned" means a purchase that actually settled. PENDENTE grants
   * nothing — an abandoned checkout must not show somebody a pacote they
   * never paid for.
   */
  async ownsPackage(readerId: string, packageId: string): Promise<boolean> {
    const hit = await this.prisma.packagePurchase.findFirst({
      where: { readerId, packageId, status: 'PAGO' },
      select: { id: true },
    });
    return hit !== null;
  }
}
