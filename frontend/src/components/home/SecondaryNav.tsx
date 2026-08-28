import { getNavCategories } from "@/lib/categories";
import { SecondaryNavStrip } from "./SecondaryNavStrip";

/**
 * Secondary navigation strip under the main header. Shows the
 * "spillover" top-level categories — anything beyond PRIMARY_NAV_LIMIT
 * that didn't fit in the primary <SiteHeader> nav.
 *
 * Partition logic lives in `lib/categories.ts:getNavCategories()` so
 * both navs always agree on what goes where without importing each
 * other.
 *
 * Stays a server component: it only fetches and hands the list to the
 * client strip, which does the measuring the carousel needs.
 *
 * Returns null when there is no spillover so we don't render an empty
 * strip.
 */
export async function SecondaryNav() {
  const { secondary } = await getNavCategories();
  if (secondary.length === 0) return null;
  return <SecondaryNavStrip items={secondary} />;
}
