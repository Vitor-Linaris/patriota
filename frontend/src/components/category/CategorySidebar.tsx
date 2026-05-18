import Link from "next/link";
import { SectionMarker } from "./SectionMarker";
import { getCategories } from "@/lib/categories";

interface CategorySidebarProps {
  currentSlug: string;
  newsletterTitle: string;
}

const OPINIONS = [
  {
    initials: "JM",
    name: "Prof. João Marques",
    role: "Economista, ISEG",
    title: "A ilusão do crescimento sem reforma estrutural",
  },
  {
    initials: "IV",
    name: "Dra. Inês Vasconcelos",
    role: "Jurista constitucional",
    title: "Separação de poderes: o que está realmente em causa",
  },
];

// Mocked article counts for other rubrics.
const OTHER_COUNTS: Record<string, number> = {
  politica: 24,
  economia: 24,
  sociedade: 18,
  investigacao: 9,
  mundo: 31,
  tecnologia: 15,
};

export async function CategorySidebar({
  currentSlug,
  newsletterTitle,
}: CategorySidebarProps) {
  const cats = await getCategories();
  const others = cats
    .filter((c) => c.slug !== currentSlug && OTHER_COUNTS[c.slug] !== undefined)
    .slice(0, 5);

  return (
    <aside className="flex flex-col gap-8">
      {/* Newsletter */}
      <section className="rounded-xl bg-patriota-dark p-6 text-white shadow-md">
        <p className="text-[11px] font-bold uppercase tracking-wider text-patriota-accent">
          Newsletter
        </p>
        <h3 className="mt-2 text-[20px] font-black leading-snug">
          {newsletterTitle}
        </h3>
        <p className="mt-2 text-[13px] text-white/70">
          Curadoria editorial diária, sem spam. Cancelamento imediato.
        </p>
        <form className="mt-5 flex flex-col gap-3">
          <input
            type="email"
            placeholder="O seu e-mail"
            className="h-10 rounded-md border border-white/10 bg-white/5 px-4 text-[13px] text-white placeholder:text-white/40 outline-none focus:border-patriota-accent/50"
          />
          <button
            type="submit"
            className="h-10 rounded-md bg-patriota-accent text-[13px] font-bold text-patriota-ink transition hover:brightness-105"
          >
            Subscrever gratuitamente
          </button>
        </form>
      </section>

      {/* Opinião */}
      <section>
        <SectionMarker title="Opinião" />
        <ul className="mt-4 flex flex-col gap-3">
          {OPINIONS.map((o) => (
            <li key={o.name}>
              <a
                href="#"
                className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-patriota-pure text-[12px] font-bold text-patriota-accent">
                  {o.initials}
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-slate-900">
                    {o.name}
                  </p>
                  <p className="text-[11px] text-slate-500">{o.role}</p>
                  <h4 className="mt-2 text-[13px] font-bold leading-snug text-slate-900">
                    {o.title}
                  </h4>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* NOS Ad */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-rose-50 to-amber-50 p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-lg bg-white text-3xl font-black text-rose-500 shadow">
          N
        </div>
        <p className="text-[15px] font-bold text-slate-900">
          NOS — Internet Fibra 1 Gbps
        </p>
        <p className="mt-2 text-[13px] text-slate-600">
          Velocidade máxima para toda a família. A partir de 29,99€/mês.
        </p>
        <a
          href="#"
          className="mt-4 inline-flex rounded-md bg-rose-500 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-rose-600"
        >
          Ver oferta
        </a>
        <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-400">
          Publicidade
        </p>
      </section>

      {/* Outras Rubricas */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-[15px] font-bold text-slate-900">
            Outras Rubricas
          </h3>
        </header>
        <ul className="divide-y divide-slate-100">
          {others.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/categoria/${c.slug}`}
                className="flex items-center justify-between px-5 py-3 text-[14px] transition hover:bg-slate-50"
              >
                <span className="font-semibold text-slate-800">{c.label}</span>
                <span className="flex items-center gap-3 text-[12px] text-slate-500">
                  <span>{OTHER_COUNTS[c.slug]} artigos</span>
                  <span aria-hidden className="text-slate-400">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
