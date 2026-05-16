interface RelatedItem {
  category: string;
  title: string;
  time: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  Política: "text-red-600",
  Economia: "text-emerald-600",
  Sociedade: "text-blue-600",
  Investigação: "text-amber-600",
  Mundo: "text-purple-600",
};

const RELATED: RelatedItem[] = [
  {
    category: "Política",
    title: "PS reage com críticas ao modelo de financiamento proposto",
    time: "Há 45 minutos",
  },
  {
    category: "Economia",
    title: "FMI alerta para riscos de aceleração da dívida pública europeia",
    time: "Há 2 horas",
  },
  {
    category: "Sociedade",
    title: "Sindicatos convocam manifestação para o próximo sábado",
    time: "Há 3 horas",
  },
];

export function ArticleSidebar() {
  return (
    <aside className="flex flex-col gap-6">
      {/* Relacionado */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-[15px] font-bold text-slate-900">Relacionado</h2>
        </header>
        <ul className="divide-y divide-slate-100">
          {RELATED.map((r) => (
            <li key={r.title}>
              <a
                href="#"
                className="block px-5 py-4 transition hover:bg-slate-50"
              >
                <p
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    CATEGORY_COLOR[r.category] ?? "text-slate-600"
                  }`}
                >
                  {r.category}
                </p>
                <h3 className="mt-1 text-[14px] font-bold leading-snug text-slate-900">
                  {r.title}
                </h3>
                <p className="mt-2 text-[12px] text-slate-500">{r.time}</p>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* Santander ad */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-red-50 to-orange-50 p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-lg bg-white text-3xl font-black text-red-600 shadow">
          S
        </div>
        <p className="text-[15px] font-bold text-slate-900">
          Santander — Conta Jovem sem custos
        </p>
        <p className="mt-2 text-[13px] text-slate-600">
          Para jovens até 30 anos. Cartão gratuito, transferências ilimitadas.
        </p>
        <a
          href="#"
          className="mt-4 inline-flex rounded-md bg-red-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-red-700"
        >
          Abrir conta
        </a>
        <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-400">
          Publicidade
        </p>
      </section>

      {/* Acompanhar tema */}
      <section className="rounded-lg bg-patriota-dark p-6 text-white shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-wider text-patriota-accent">
          Acompanhar tema
        </p>
        <h2 className="mt-2 text-[18px] font-black leading-snug">
          Orçamento do Estado 2026
        </h2>
        <p className="mt-2 text-[13px] text-white/70">
          Receba alertas sobre desenvolvimentos neste tema.
        </p>
        <button
          type="button"
          className="mt-5 h-10 w-full rounded-md bg-patriota-accent text-[13px] font-bold text-patriota-ink transition hover:brightness-105"
        >
          Seguir tema
        </button>
      </section>

      {/* Ouvir artigo */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Reproduzir áudio do artigo"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-patriota-pure text-patriota-accent transition hover:opacity-90"
          >
            ▶
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-slate-900">Ouvir artigo</p>
            <p className="text-[12px] text-slate-500">
              4 minutos · Narrado por IA
            </p>
          </div>
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <span className="block h-full w-1/3 rounded-full bg-patriota-pure" />
        </div>
      </section>

      {/* Newsletter */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-[15px] font-bold text-slate-900">
          Newsletter do Patriota
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Manchetes diárias na sua caixa de correio.
        </p>
        <form className="mt-4 flex flex-col gap-2">
          <input
            type="email"
            placeholder="O seu e-mail"
            className="h-10 rounded-md border border-slate-200 px-3 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-patriota-medium"
          />
          <button
            type="submit"
            className="h-10 rounded-md bg-patriota-dark text-[13px] font-bold text-white transition hover:bg-patriota-medium"
          >
            Subscrever
          </button>
        </form>
      </section>
    </aside>
  );
}
