import { AdminShell } from "./AdminShell";

interface Stat {
  label: string;
  value: string;
  change: string;
  up: boolean;
  cardClass: string;
  accent: string;
  changeClass: string;
}

const STATS: Stat[] = [
  {
    label: "Artigos publicados",
    value: "1.482",
    change: "+12 hoje",
    up: true,
    cardClass: "bg-blue-50 border-blue-200",
    accent: "text-[#0F2C6B]",
    changeClass: "text-green-600",
  },
  {
    label: "Utilizadores registados",
    value: "241.093",
    change: "+847 esta semana",
    up: true,
    cardClass: "bg-green-50 border-green-200",
    accent: "text-green-700",
    changeClass: "text-green-600",
  },
  {
    label: "Visitas hoje",
    value: "94.210",
    change: "+18% vs ontem",
    up: true,
    cardClass: "bg-purple-50 border-purple-200",
    accent: "text-purple-700",
    changeClass: "text-green-600",
  },
  {
    label: "Artigos pendentes",
    value: "7",
    change: "Aguardam aprovação",
    up: false,
    cardClass: "bg-amber-50 border-amber-200",
    accent: "text-amber-700",
    changeClass: "text-amber-600",
  },
];

interface Activity {
  user: string;
  role: string;
  action: string;
  target: string;
  time: string;
  badgeClass: string;
}

const RECENT_ACTIVITY: Activity[] = [
  {
    user: "Marta Sousa",
    role: "Jornalista",
    action: "submeteu artigo",
    target: '"Crise da habitação em Lisboa atinge novos máximos"',
    time: "Há 4 min",
    badgeClass: "bg-green-100 text-green-700",
  },
  {
    user: "Paulo Ferreira",
    role: "Editor",
    action: "publicou",
    target: '"FMI alerta para dívida pública europeia"',
    time: "Há 12 min",
    badgeClass: "bg-blue-100 text-blue-700",
  },
  {
    user: "Ana Lopes",
    role: "Moderador",
    action: "removeu comentário em",
    target: '"Orçamento do Estado 2026"',
    time: "Há 28 min",
    badgeClass: "bg-orange-100 text-orange-700",
  },
  {
    user: "Rui Cardoso",
    role: "Editor-Chefe",
    action: "aprovou e editou",
    target: '"Investigação: Contratos públicos suspeitos"',
    time: "Há 45 min",
    badgeClass: "bg-purple-100 text-purple-700",
  },
  {
    user: "Sofia Pinto",
    role: "Revisor",
    action: "devolveu para revisão",
    target: '"PS reage com críticas ao orçamento"',
    time: "Há 1h",
    badgeClass: "bg-amber-100 text-amber-700",
  },
];

interface PendingArticle {
  title: string;
  author: string;
  cat: string;
  submitted: string;
  priority: "Alta" | "Média" | "Baixa";
}

const PENDING: PendingArticle[] = [
  {
    title: "Greve dos professores paralisa escolas no Norte",
    author: "Carlos Neves",
    cat: "SOCIEDADE",
    submitted: "Há 2h",
    priority: "Alta",
  },
  {
    title: "Banco de Portugal revê projeção do PIB em alta",
    author: "Marta Sousa",
    cat: "ECONOMIA",
    submitted: "Há 3h",
    priority: "Média",
  },
  {
    title: "Governo apresenta nova lei do arrendamento",
    author: "Inês Rodrigues",
    cat: "POLÍTICA",
    submitted: "Há 5h",
    priority: "Alta",
  },
  {
    title: "Festival NOS regressa ao Parque da Bela Vista",
    author: "Luís Monteiro",
    cat: "CULTURA",
    submitted: "Há 6h",
    priority: "Baixa",
  },
];

const PRIORITY_CLASS: Record<PendingArticle["priority"], string> = {
  Alta: "bg-red-100 text-red-700",
  Média: "bg-amber-100 text-amber-700",
  Baixa: "bg-gray-100 text-gray-500",
};

export default function AdminDashboardPage() {
  return (
    <AdminShell active="/admin">
      <main className="bg-[#f6f7fb] p-8">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-2xl font-black text-[#0F2C6B]">
            Painel de Controlo
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Domingo, 12 de Abril de 2026 · Edição matinal
          </p>
        </header>

        {/* Stats */}
        <section className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          {STATS.map((s) => (
            <div
              key={s.label}
              className={`rounded-xl border bg-white p-5 ${s.cardClass}`}
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {s.label}
              </p>
              <p className={`text-3xl font-black ${s.accent}`}>{s.value}</p>
              <p className={`mt-1 text-xs font-semibold ${s.changeClass}`}>
                {s.change}
              </p>
            </div>
          ))}
        </section>

        {/* 2/3 + 1/3 grid */}
        <section className="grid gap-6 xl:grid-cols-3">
          {/* Pending articles */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white xl:col-span-2">
            <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-black text-[#0F2C6B]">
                  Artigos a aprovar
                </h2>
                <p className="text-xs text-gray-400">
                  Aguardam decisão editorial
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                {PENDING.length} pendentes
              </span>
            </header>
            <ul className="divide-y divide-gray-50">
              {PENDING.map((a) => (
                <li
                  key={a.title}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[10px] font-black tracking-wide text-[#0F2C6B]">
                        {a.cat}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${PRIORITY_CLASS[a.priority]}`}
                      >
                        {a.priority}
                      </span>
                      <span className="text-[10px] text-gray-300">
                        {a.submitted}
                      </span>
                    </div>
                    <p className="truncate text-sm font-semibold text-gray-800">
                      {a.title}
                    </p>
                    <p className="text-xs text-gray-400">{a.author}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:border-red-300 hover:text-red-600"
                    >
                      Devolver
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-[#0F2C6B] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1A3A7A]"
                    >
                      Aprovar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Activity log */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <header className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-black text-[#0F2C6B]">
                Actividade recente
              </h2>
              <p className="text-xs text-gray-400">
                Últimas acções da equipa
              </p>
            </header>
            <ul className="divide-y divide-gray-50">
              {RECENT_ACTIVITY.map((a, i) => (
                <li key={i} className="px-5 py-3.5">
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${a.badgeClass}`}
                    >
                      {a.role.split("-")[0]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs leading-relaxed text-gray-800">
                        <span className="font-bold">{a.user}</span>{" "}
                        <span className="text-gray-500">{a.action}</span>{" "}
                        <span className="font-semibold text-[#0F2C6B]">
                          {a.target}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-gray-400">
                        {a.time}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-gray-50 px-5 py-3">
              <button
                type="button"
                className="text-xs font-semibold text-[#0F2C6B] hover:underline"
              >
                Ver histórico completo →
              </button>
            </div>
          </div>
        </section>
      </main>
    </AdminShell>
  );
}
