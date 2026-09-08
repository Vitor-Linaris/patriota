import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../billing/stripe.service';

export interface PackageStripeIds {
  productId: string | null;
  priceId: string | null;
}

/**
 * Keeps a pacote's Stripe Product and Price in step with the row.
 *
 * One Product per pacote, reused for the life of it, and a chain of
 * immutable Prices — which is not a design choice, it is how Stripe works.
 * A Price's amount cannot be edited, so changing the price means creating
 * the next one and deactivating the last. That turns out to be the
 * behaviour you want anyway: a checkout session already open against the
 * old Price completes at the old amount, which is the correct answer to
 * "what was I shown when I clicked buy".
 *
 * Nothing here throws when Stripe is not configured. A newsroom must be
 * able to build and publish pacotes before payments are switched on — the
 * pacote simply shows without a buy button until there is a Price, exactly
 * as the subscription page already behaves.
 */
@Injectable()
export class PackageStripeService {
  private readonly logger = new Logger(PackageStripeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  private siteUrl(): string {
    return (
      this.config.get<string>('PUBLIC_SITE_URL') ?? 'http://localhost:3005'
    );
  }

  /**
   * Absolute URL for the cover, or nothing.
   *
   * Stripe fetches these itself, from its own servers, so a relative path
   * or a localhost address is worse than no image — it is a broken one on
   * the checkout page and in the receipt.
   */
  private coverUrl(coverImageUrl: string | null): string[] {
    if (!coverImageUrl) return [];
    if (/^https:\/\//.test(coverImageUrl)) return [coverImageUrl];
    const site = this.siteUrl();
    if (!site.startsWith('https://')) return [];
    return [`${site}${coverImageUrl.startsWith('/') ? '' : '/'}${coverImageUrl}`];
  }

  /**
   * Create or refresh the Product, and the Price if the amount moved.
   *
   * Safe to call repeatedly — it is called on publish and on every save of
   * a published pacote — because each step asks Stripe what it already has
   * before writing.
   */
  async sync(packageId: string): Promise<PackageStripeIds> {
    const pkg = await this.prisma.package.findUnique({
      where: { id: packageId },
      select: {
        id: true,
        name: true,
        description: true,
        coverImageUrl: true,
        priceCents: true,
        currency: true,
        stripeProductId: true,
        stripePriceId: true,
      },
    });
    if (!pkg) return { productId: null, priceId: null };

    if (!this.stripe.enabled) {
      this.logger.warn(
        `Pacote ${packageId}: Stripe não configurado, sem Product/Price. ` +
          'O pacote fica visível sem botão de compra.',
      );
      return { productId: null, priceId: null };
    }

    try {
      const productId = await this.syncProduct(pkg);
      const priceId = await this.syncPrice(pkg, productId);

      if (
        productId !== pkg.stripeProductId ||
        priceId !== pkg.stripePriceId
      ) {
        await this.prisma.package.update({
          where: { id: pkg.id },
          data: { stripeProductId: productId, stripePriceId: priceId },
        });
      }
      return { productId, priceId };
    } catch (e) {
      // Surfaced as a readable failure on the admin action rather than a
      // 500: "publicar" is a button an editor pressed, and they need to be
      // told Stripe refused, not shown a stack trace.
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`Stripe recusou o pacote ${packageId}: ${message}`);
      throw new ServiceUnavailableException(
        `O Stripe recusou este pacote: ${message}`,
      );
    }
  }

  private async syncProduct(pkg: {
    id: string;
    name: string;
    description: string;
    coverImageUrl: string | null;
    stripeProductId: string | null;
  }): Promise<string> {
    const images = this.coverUrl(pkg.coverImageUrl);
    const shared = {
      name: pkg.name,
      // Stripe rejects an empty string here, where it accepts the field
      // being absent. A pacote with no description is normal.
      ...(pkg.description ? { description: pkg.description } : {}),
      images,
      metadata: { packageId: pkg.id },
    };

    if (!pkg.stripeProductId) {
      const created = await this.stripe.stripe.products.create(shared);
      this.logger.log(`Pacote ${pkg.id}: Product ${created.id} criado.`);
      return created.id;
    }
    // Products ARE mutable, unlike Prices. Renaming a pacote should rename
    // it on the receipt, not fork a second product.
    await this.stripe.stripe.products.update(pkg.stripeProductId, shared);
    return pkg.stripeProductId;
  }

  private async syncPrice(
    pkg: {
      id: string;
      priceCents: number;
      currency: string;
      stripePriceId: string | null;
    },
    productId: string,
  ): Promise<string | null> {
    if (pkg.priceCents <= 0) return null;
    const currency = pkg.currency.toLowerCase();

    if (pkg.stripePriceId) {
      const current = await this.stripe.stripe.prices.retrieve(
        pkg.stripePriceId,
      );
      const unchanged =
        current.active &&
        current.unit_amount === pkg.priceCents &&
        current.currency === currency;
      if (unchanged) return pkg.stripePriceId;
    }

    const created = await this.stripe.stripe.prices.create({
      product: productId,
      unit_amount: pkg.priceCents,
      currency,
      metadata: { packageId: pkg.id },
    });

    if (pkg.stripePriceId) {
      // Deactivated, never deleted: it is attached to every past payment,
      // and Stripe keeps the history readable only while it exists.
      await this.stripe.stripe.prices.update(pkg.stripePriceId, {
        active: false,
      });
      this.logger.log(
        `Pacote ${pkg.id}: Price ${pkg.stripePriceId} desactivado, ` +
          `${created.id} activo (${pkg.priceCents} ${currency}).`,
      );
    }
    return created.id;
  }
}
