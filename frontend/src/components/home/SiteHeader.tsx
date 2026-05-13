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
        <a href="/" className="flex items-end gap-[3px]" aria-label="O Patriota">
          <Image
            src="/brand/patriota-o.svg"
            alt=""
            width={18}
            height={18}
            className="mb-[10px]"
            priority
          />
          <div className="flex flex-col">
            <Image
              src="/brand/patriota.svg"
              alt="O Patriota"
              width={120}
              height={40}
              priority
            />
            <Image
              src="/brand/patriota-noticias.svg"
              alt=""
              width={42}
              height={9}
              className="ml-[48px] mt-[2px]"
              priority
            />
          </div>
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
