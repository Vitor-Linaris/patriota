import { SectionHeading } from "./SectionHeading";

const MOST_READ = [
  { n: 1, category: "Política", title: "Governo apresenta proposta de orçamento com aumento de 3,2% na despesa pública" },
  { n: 2, category: "Economia", title: "Exportações portuguesas atingem máximo histórico no primeiro trimestre" },
  { n: 3, category: "Sociedade", title: "Estudo revela que portugueses trabalham em média mais 2 horas semanais do que a média…" },
  { n: 4, category: "Investigação", title: "Contratos públicos: auditoria revela irregularidades em adjudicações de 2022 a…" },
];

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
  {
    initials: "PT",
    name: "Pedro Tavares",
    role: "Analista político",
    title: "Por que razão os partidos centristas estão a perder a narrativa",
  },
];

export function Sidebar() {
  return (
    <aside className="flex flex-col gap-8">
      {/* Most read */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <nav
          aria-label="Mais lidas / Comentadas / Escolha"
          className="flex border-b border-slate-200 text-[12px]"
        >
          <button className="flex-1 border-b-2 border-orange-500 bg-orange-50 px-4 py-4 font-bold text-slate-900">
            Mais Lidas
          </button>
          <button className="flex-1 px-4 py-4 font-semibold text-slate-500 hover:text-slate-700">
            Mais Comentadas
          </button>
          <button className="flex-1 px-4 py-4 text-center font-semibold leading-tight text-slate-500 hover:text-slate-700">
            Escolha da
            <br />
            Redação
          </button>
        </nav>
        <ol className="divide-y divide-slate-100">
          {MOST_READ.map((m) => (
            <li key={m.n} className="flex gap-3 px-4 py-3 hover:bg-slate-50">
              <span className="text-2xl font-black leading-none text-slate-300">
                {m.n}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600">
                  {m.category}
                </p>
                <h4 className="mt-1 text-[13px] font-bold leading-snug text-slate-900">
                  <a href="#" className="hover:text-patriota-medium">
                    {m.title}
                  </a>
                </h4>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* NOS Ad card */}
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

      {/* Opinion */}
      <section>
        <SectionHeading>Opinião</SectionHeading>
        <ul className="mt-4 flex flex-col gap-3">
          {OPINIONS.map((o) => (
            <li key={o.name}>
              <a
                href="#"
                className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-patriota-medium text-[12px] font-bold text-white">
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

      {/* Newsletter */}
      <section className="rounded-xl bg-patriota-dark p-6 text-white shadow-md">
        <p className="text-[11px] font-bold uppercase tracking-wider text-patriota-accent">
          Newsletter
        </p>
        <h3 className="mt-2 text-[20px] font-black leading-snug">
          Receba as manchetes do dia
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
    </aside>
  );
}
