import Image from "next/image";
import Link from "next/link";
import { Container } from "../Container";

interface NavItem {
  href: string;
  label: string;
  slug?: string;
  strong?: boolean;
}

/**
 * Primary top navigation. Hardcoded because the editorial order
 * matters more than the DB row order — "Última Hora" must be first,
 * "Política" must be second, etc.
 *
 * `TOP_NAV_SLUGS` is exported so SecondaryNav can de-dupe — items
 * here are filtered out of the secondary bar, otherwise the two
 * menus repeat the same categories one above the other.
 */
const NAV: NavItem[] = [
  { href: "/categoria/ultima-hora", label: "Última Hora", strong: true },
  { href: "/categoria/politica", label: "Política", slug: "politica" },
  { href: "/categoria/economia", label: "Economia", slug: "economia" },
  { href: "/categoria/sociedade", label: "Sociedade", slug: "sociedade" },
  { href: "/categoria/investigacao", label: "Investigação", slug: "investigacao" },
  { href: "/categoria/opiniao", label: "Opinião", slug: "opiniao" },
  { href: "/categoria/multimedia", label: "Multimédia", slug: "multimedia" },
];

export const TOP_NAV_SLUGS: ReadonlySet<string> = new Set(
  NAV.map((n) => n.slug).filter((s): s is string => Boolean(s)),
);

export function SiteHeader() {
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
        <nav className="hidden items-center gap-7 text-[14px] lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.label}
              href={n.href}
              className={
                "transition hover:text-patriota-medium " +
                (n.strong
                  ? "font-bold text-patriota-dark"
                  : "text-slate-700")
              }
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </Container>
    </header>
  );
}
