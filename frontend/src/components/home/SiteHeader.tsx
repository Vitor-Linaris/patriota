import Image from "next/image";
import { Container } from "../Container";

const NAV = [
  { href: "#", label: "Última Hora", strong: true },
  { href: "#", label: "Política" },
  { href: "#", label: "Economia" },
  { href: "#", label: "Sociedade" },
  { href: "#", label: "Investigação" },
  { href: "#", label: "Opinião" },
  { href: "#", label: "Multimédia" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <Container className="flex h-[82px] items-center justify-between">
        <a href="/" aria-label="O Patriota" className="inline-flex">
          <Image
            src="/brand/Logo-header.svg"
            alt="O Patriota"
            width={132}
            height={54}
            priority
          />
        </a>
        <nav className="hidden items-center gap-7 text-[14px] lg:flex">
          {NAV.map((n) => (
            <a
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
            </a>
          ))}
        </nav>
      </Container>
    </header>
  );
}
