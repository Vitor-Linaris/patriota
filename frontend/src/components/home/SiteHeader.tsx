import Image from "next/image";
import Link from "next/link";
import { Container } from "../Container";

const NAV = [
  { href: "/categoria/ultima-hora", label: "Última Hora", strong: true },
  { href: "/categoria/politica", label: "Política" },
  { href: "/categoria/economia", label: "Economia" },
  { href: "/categoria/sociedade", label: "Sociedade" },
  { href: "/categoria/investigacao", label: "Investigação" },
  { href: "/categoria/opiniao", label: "Opinião" },
  { href: "/categoria/multimedia", label: "Multimédia" },
];

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
