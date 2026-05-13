import { SectionHeading } from "./SectionHeading";

interface Card {
  label: string;
  title: string;
  excerpt: string;
  read: string;
  accent: string; // tailwind color class for label bg
}

const CARDS: Card[] = [
  {
    label: "Investigação A21",
    title: "Máfia dos Seguros: como uma rede ilegal funciona à luz do dia",
    excerpt:
      "Uma investigação de 6 meses revela esquemas de burla a seguradoras que lesaram o erário público em 40 milhões.",
    read: "12 min leitura →",
    accent: "bg-red-600",
  },
  {
    label: "Entrelinhas",
    title: "O que dizem os contratos que o governo não quis mostrar",
    excerpt:
      "Documentos obtidos em exclusivo mostram cláusulas de confidencialidade invulgares em concessões públicas recentes.",
    read: "9 min leitura →",
    accent: "bg-amber-600",
  },
];

export function InvestigationSection() {
  return (
    <section>
      <SectionHeading>Investigação & Análise</SectionHeading>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CARDS.map((c) => (
          <article
            key={c.title}
            className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 transition hover:shadow-md"
          >
            <span
              className={`inline-flex w-fit rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white ${c.accent}`}
            >
              {c.label}
            </span>
            <h3 className="text-[18px] font-black leading-snug text-slate-900">
              <a href="#" className="hover:text-patriota-medium">
                {c.title}
              </a>
            </h3>
            <p className="text-[13px] leading-relaxed text-slate-600">
              {c.excerpt}
            </p>
            <a
              href="#"
              className="mt-auto text-[12px] font-semibold uppercase tracking-wider text-patriota-medium"
            >
              {c.read}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
