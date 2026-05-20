import Link from "next/link";
import { Container } from "../Container";
import { getCategories } from "@/lib/categories";
import { TOP_NAV_SLUGS } from "./SiteHeader";

/**
 * Secondary navigation strip under the main header. Pulls the live
 * category catalogue from /public/categories (visible ones only) and
 * filters out anything already shown in the primary SiteHeader nav
 * — otherwise the two bars repeat the same labels (Política →
 * Política, Economia → Economia, …).
 *
 * The "spillover" categories that end up here are typically: Portugal,
 * Mundo, Tecnologia, Saúde, Cultura, Desporto — anything visible
 * in the DB that isn't in TOP_NAV_SLUGS.
 *
 * Returns null when there are no spillover categories so we don't
 * render an empty strip.
 */
export async function SecondaryNav() {
  const cats = await getCategories();
  const spillover = cats.filter((c) => !TOP_NAV_SLUGS.has(c.slug));
  if (spillover.length === 0) return null;
  return (
    <div className="bg-[#f0f2f7]">
      <Container className="flex h-9 items-center gap-6 overflow-x-auto text-[12px] font-medium text-[#667085]">
        {spillover.map((c) => (
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
