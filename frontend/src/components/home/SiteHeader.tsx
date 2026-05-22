import Image from "next/image";
import Link from "next/link";
import { Container } from "../Container";
import { getNavCategories } from "@/lib/categories";

/**
 * Primary top navigation. Lives 100% off the category catalogue
 * (`/public/categories`, ordered by `order asc`) so the admin
 * controls what shows up here from `/admin/categorias` — there is
 * no hardcoded list to fall out of sync.
 *
 * The first PRIMARY_NAV_LIMIT categories land here; the rest fall
 * through to <SecondaryNav>. Partition logic lives in
 * `lib/categories.ts:getNavCategories()` so both components share
 * the same source of truth.
 *
 * "Última Hora" is intentionally NOT in this bar:
 *   • The animated ticker right above (BreakingNews) already shows
 *     the four most recent published articles — that IS the última
 *     hora and is dynamic by definition.
 *   • Adding it here too would just duplicate the same intent in
 *     two places and required hardcoding /categoria/ultima-hora
 *     which doesn't exist as a real category.
 */
export async function SiteHeader() {
  const { primary } = await getNavCategories();
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
      </Container>
    </header>
  );
}
