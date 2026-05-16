import Link from "next/link";
import { Container } from "../Container";

const ITEMS = [
  { slug: "portugal", label: "Portugal" },
  { slug: "mundo", label: "Mundo" },
  { slug: "justica", label: "Justiça" },
  { slug: "tecnologia", label: "Tecnologia" },
  { slug: "saude", label: "Saúde" },
  { slug: "cultura", label: "Cultura" },
  { slug: "desporto", label: "Desporto" },
];

export function SecondaryNav() {
  return (
    <div className="bg-[#f0f2f7]">
      <Container className="flex h-9 items-center gap-6 overflow-x-auto text-[12px] font-medium text-[#667085]">
        {ITEMS.map((it) => (
          <Link
            key={it.slug}
            href={`/categoria/${it.slug}`}
            className="whitespace-nowrap transition hover:text-slate-900"
          >
            {it.label}
          </Link>
        ))}
      </Container>
    </div>
  );
}
