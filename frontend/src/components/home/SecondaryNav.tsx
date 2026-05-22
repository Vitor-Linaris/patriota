import Link from "next/link";
import { Container } from "../Container";
import { getNavCategories } from "@/lib/categories";

/**
 * Secondary navigation strip under the main header. Shows the
 * "spillover" categories — anything beyond the PRIMARY_NAV_LIMIT
 * that didn't fit in the primary <SiteHeader> nav.
 *
 * Partition logic lives in `lib/categories.ts:getNavCategories()`
 * so both navs always agree on what goes where without having to
 * import each other.
 *
 * Returns null when there are no spillover categories so we don't
 * render an empty strip.
 */
export async function SecondaryNav() {
  const { secondary } = await getNavCategories();
  if (secondary.length === 0) return null;
  return (
    <div className="bg-[#f0f2f7]">
      <Container className="flex h-9 items-center gap-6 overflow-x-auto text-[12px] font-medium text-[#667085]">
        {secondary.map((c) => (
          <Link
            key={c.slug}
            href={`/categoria/${c.slug}`}
            className="whitespace-nowrap transition hover:text-slate-900"
          >
            {c.label}
          </Link>
        ))}
      </Container>
    </div>
  );
}
