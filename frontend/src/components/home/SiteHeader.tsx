import Image from "next/image";
import Link from "next/link";
import { Container } from "../Container";
import { getNavCategories } from "@/lib/categories";
import { MobileNav } from "./MobileNav";
import { CategoryMegaMenu } from "./CategoryMegaMenu";

/**
 * Primary top navigation. Lives 100% off the category catalogue
 * (`/public/categories`, ordered by `order asc`) so the admin
 * controls what shows up here from `/admin/categorias` — there is
 * no hardcoded list to fall out of sync.
 *
 * Layout
 *   • Desktop (≥ lg) → inline category links to the right of the logo
 *   • Tablet + mobile (< lg) → hamburger button that opens the
 *     <MobileNav> drawer with the full category list + shortcuts
 *
 * "Última Hora" is intentionally NOT in this bar — the animated
 * BreakingNews ticker right above already shows the four most recent
 * published articles, which IS última hora and is dynamic by
 * definition.
 */
export async function SiteHeader() {
  const { primary, secondary } = await getNavCategories();
  return (
    // relative + z-40 so the megamenu panel paints over the strips that
    // follow it in the document rather than being clipped behind them.
    <header className="relative z-40 border-b border-slate-200 bg-white">
      <Container className="flex h-[82px] items-center justify-between">
        <Link href="/" aria-label="O Patriota" className="inline-flex">
          <Image
            src="/brand/Logo-header.svg"
            alt="O Patriota"
            width={132}
            height={54}
            priority
            // h-auto silences the Next warning when the parent flex
            // container constrains the width: it tells the browser
            // to let height scale with the aspect ratio rather than
            // staying pinned at 54px while width shrinks.
            className="h-auto"
          />
        </Link>

        {/* Desktop: inline links, with a panel on sections that have
            subsections. Hidden below `lg`. */}
        {primary.length > 0 && (
          // relative: the megamenu panels are positioned against this
          // bar, so they can never run off the edge of the page.
          <nav className="relative hidden items-center gap-7 text-[14px] lg:flex">
            {primary.map((c) => (
              <CategoryMegaMenu key={c.slug} category={c} />
            ))}
          </nav>
        )}

        {/* Tablet + mobile: hamburger. Hidden at `lg` and above. */}
        <MobileNav primary={primary} secondary={secondary} />
      </Container>
    </header>
  );
}
