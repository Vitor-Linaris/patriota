import { SectionHeading } from "./SectionHeading";
import { CATEGORY_COLOR } from "./HeroGrid";

interface NewsItem {
  category: string;
  time: string;
  read: string;
  title: string;
  excerpt: string;
}

const ITEMS: NewsItem[] = [
  {
    category: "Economia",
    time: "Há 35 minutos",
    read: "3 min leitura",
    title:
      "Exportações portuguesas atingem máximo histórico no primeiro trimestre",
    excerpt:
      "Setor do turismo e tecnologia lideram crescimento das receitas externas.",
  },
  {
    category: "Sociedade",
    time: "Há 1 hora",
    read: "5 min leitura",
    title:
      "Estudo revela que portugueses trabalham em média mais 2 horas semanais do que a média europeia",
    excerpt:
      "Dados do Eurostat mostram disparidade persistente nas horas de trabalho efetivas.",
  },
  {
    category: "Investigação",
    time: "Há 2 horas",
    read: "8 min leitura",
    title:
      "Contratos públicos: auditoria revela irregularidades em adjudicações de 2022 a 2024",
    excerpt:
      "Tribunal de Contas identifica 47 processos com incumprimento das regras de concorrência.",
  },
  {
    category: "Mundo",
    time: "Há 3 horas",
    read: "6 min leitura",
    title:
      "Cimeira europeia debate novas regras para regulação de plataformas digitais",
    excerpt:
      "Comissão Europeia propõe framework único para responsabilização das big tech.",
  },
];

export function LatestNews() {
  return (
    <section>
      <SectionHeading>Últimas Notícias</SectionHeading>
      <ul className="mt-5 flex flex-col gap-4">
        {ITEMS.map((item) => (
          <li key={item.title}>
            <a
              href="#"
              className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md"
            >
              <div className="hidden h-20 w-28 shrink-0 rounded-md bg-gradient-to-br from-slate-200 to-slate-300 sm:block" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ${
                      CATEGORY_COLOR[item.category] ?? "bg-slate-600"
                    }`}
                  >
                    {item.category}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{item.time}</span>
                  <span aria-hidden>·</span>
                  <span>{item.read}</span>
                </div>
                <h3 className="mt-2 text-[15px] font-bold leading-snug text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-[13px] text-slate-600">
                  {item.excerpt}
                </p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
