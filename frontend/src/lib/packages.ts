import { apiBaseUrl } from "./api-base";
import { getReaderToken } from "./reader-api";
import type { ArticleSummary } from "./public-api";

export interface PackageCard {
  id: string;
  slug: string;
  name: string;
  description: string;
  coverImageUrl: string | null;
  priceCents: number;
  currency: string;
  includedInSubscription: boolean;
  publishedAt: string | null;
  _count: { items: number };
}

export interface PackageDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  coverImageUrl: string | null;
  priceCents: number;
  currency: string;
  includedInSubscription: boolean;
  publishedAt: string | null;
  /**
   * Whether this pacote can take money right now — Stripe configured AND
   * a Price minted. A boolean rather than the Price id: whether it is
   * buyable is all the page needs, and the id is ours.
   */
  purchasable: boolean;
  /** Only PUBLICADO members, and never carrying `content`. */
  articles: ArticleSummary[];
  /** Whether the reader making THIS request already bought it. */
  owned: boolean;
}

/** One purchase, as "Os meus pacotes" shows it. */
export interface ReaderPackage {
  packageSlug: string;
  packageName: string;
  coverImageUrl: string | null;
  amountCents: number;
  currency: string;
  source: "STRIPE" | "MANUAL";
  paidAt: string | null;
  articles: {
    slug: string;
    title: string;
    coverImageUrl: string | null;
    publishedAt: string | null;
    categoryName: string;
    /** Paid for, but the editor has since taken it out of the pacote. */
    removedFromPackage: boolean;
  }[];
}

/** Cents as a Portuguese reader reads them. */
export function formatPrice(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/**
 * The storefront listing. Identical for every visitor, so no token and no
 * no-store — /pacotes is allowed to be a cached page.
 */
export async function listPackages(): Promise<PackageCard[]> {
  try {
    const res = await fetch(`${apiBaseUrl()}/public/packages`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return (await res.json()) as PackageCard[];
  } catch {
    return [];
  }
}

/**
 * One pacote, for /pacotes/[slug].
 *
 * Carries the reader's token because the response varies per reader:
 * `owned` decides which call to action is shown, and a cached "Comprar"
 * shown to somebody who already paid is the one thing this page must not
 * do. `no-store` for the same reason — a shared cache keyed only on the
 * slug would serve one reader's answer to the next.
 *
 * Never throws; the page decides what a null means.
 */
export async function getPackageBySlug(
  slug: string,
): Promise<PackageDetail | null> {
  try {
    const token = await getReaderToken();
    const res = await fetch(
      `${apiBaseUrl()}/public/packages/by-slug/${encodeURIComponent(slug)}`,
      {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as PackageDetail;
  } catch {
    return null;
  }
}
