interface SmallCard {
  category: string;
  time: string;
  title: string;
}

const SMALL: SmallCard[] = [
  {
    category: "Economia",
    time: "Há 35 minutos",
    title: "Exportações portuguesas atingem máximo histórico no primeiro trimestre",
  },
  {
    category: "Sociedade",
    time: "Há 1 hora",
    title: "Estudo revela que portugueses trabalham em média mais 2 horas semanais do que a média europeia",
  },
  {
    category: "Investigação",
    time: "Há 2 horas",
    title: "Contratos públicos: auditoria revela irregularidades em adjudicações de 2022 a 2024",
  },
];

const CATEGORY_COLOR: Record<string, string> = {
  Política: "bg-red-600",
  Economia: "bg-emerald-600",
  Sociedade: "bg-blue-600",
  Investigação: "bg-amber-600",
  Mundo: "bg-purple-600",
};

export function HeroGrid() {
  return (
    <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Big hero card */}
      <article className="relative col-span-1 overflow-hidden rounded-xl bg-patriota-dark text-white shadow-sm lg:col-span-8">
        <div
          className="aspect-[16/9] w-full bg-gradient-to-br from-slate-700 via-patriota-medium to-patriota-dark"
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-t from-patriota-dark via-patriota-dark/85 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6 lg:p-8">
          <div className="flex items-center gap-3 text-[12px] text-white/80">
            <span
              className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${CATEGORY_COLOR["Política"]}`}
            >
              Política
            </span>
            <span>Há 12 minutos</span>
            <span aria-hidden>·</span>
            <span>4 min leitura</span>
          </div>
          <h1 className="text-2xl font-black leading-tight lg:text-[30px] lg:leading-[36px]">
            <a href="#" className="hover:underline">
              Governo apresenta proposta de orçamento com aumento de 3,2% na
              despesa pública
            </a>
          </h1>
          <p className="max-w-2xl text-[14px] leading-relaxed text-white/75">
            Ministério das Finanças defende que crescimento é sustentável face
            às projeções de crescimento do PIB.
          </p>
          <div className="mt-2 flex items-center gap-2 text-[13px] text-white/70">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-patriota-accent text-[11px] font-bold text-patriota-ink">
              AF
            </span>
            <span>Ana Ferreira</span>
          </div>
        </div>
      </article>

      {/* Side stack of 3 small cards */}
      <div className="col-span-1 flex flex-col gap-4 lg:col-span-4">
        {SMALL.map((card) => (
          <article
            key={card.title}
            className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md"
          >
            <div className="flex-1 min-w-0">
              <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white ${
                    CATEGORY_COLOR[card.category] ?? "bg-slate-600"
                  }`}
                >
                  {card.category}
                </span>
                <span aria-hidden>·</span>
                <span>{card.time}</span>
              </div>
              <h3 className="text-[14px] font-bold leading-snug text-slate-900">
                <a href="#" className="hover:text-patriota-medium">
                  {card.title}
                </a>
              </h3>
            </div>
            <div className="hidden h-16 w-20 shrink-0 rounded-md bg-gradient-to-br from-slate-200 to-slate-300 sm:block" />
          </article>
        ))}
      </div>
    </section>
  );
}

export { CATEGORY_COLOR };
