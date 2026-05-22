import Image from "next/image";
import Link from "next/link";
import { Container } from "../Container";
import { getNavCategories } from "@/lib/categories";
import { MobileNav } from "./MobileNav";

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
    <header className="border-b border-slate-200 bg-white">
      <Container className="flex h-[82px] items-center justify-between">
        <Link href="/" aria-label="O Patriota" className="inline-flex">
          <Image
            src="/brand/Logo-header.svg"
            alt="O Patriota"
            width={132}
            height={54}
            priority
          />
        </Link>

        {/* Desktop: inline links. Hidden below `lg`. */}
        {primary.length > 0 && (
          <nav className="hidden items-center gap-7 text-[14px] lg:flex">
            {primary.map((c) => (
              <Link
                key={c.slug}
                href={`/categoria/${c.slug}`}
                className="text-slate-700 transition hover:text-patriota-medium"
              >
                {c.label}
              </Link>
            ))}
          </nav>
        )}

        {/* Tablet + mobile: hamburger. Hidden at `lg` and above. */}
        <MobileNav primary={primary} secondary={secondary} />
      </Container>
    </header>
  );
}
