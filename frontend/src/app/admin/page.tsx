import { AdminShell } from "./AdminShell";
import { DashboardActions } from "./DashboardActions";
import { SubscriptionsPanel } from "./SubscriptionsPanel";
import type { ReaderStats } from "./leitores/AdminReadersClient";
import { apiFetch } from "@/lib/api";

interface StatsResponse {
  articles: { published: number; total: number; pending: number };
  users: { total: number };
  visits: { today: number; week: number; month: number };
}

interface ActivityItem {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  } | null;
}

interface PendingArticleItem {
  id: string;
  title: string;
  status:
    | "RASCUNHO"
    | "EM_REVISAO"
    | "AGENDADO"
    | "PUBLICADO"
    | "ARQUIVADO";
  createdAt: string;
  category: { slug: string; name: string; color: string } | null;
  author: { id: string; name: string | null; email: string } | null;
}

interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const intFmt = new Intl.NumberFormat("pt-PT");

function formatToday(): string {
  const now = new Date();
  const long = new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  // Capitalise first letter for visual parity with the previous mock.
  return long.charAt(0).toUpperCase() + long.slice(1);
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.max(1, Math.round((now - then) / 60_000));
  if (diffMin < 60) return `Há ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `Há ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  return `Há ${diffD}d`;
}

const ROLE_BADGE: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-700",
  EDITOR_CHEFE: "bg-purple-100 text-purple-700",
  EDITOR: "bg-blue-100 text-blue-700",
  JORNALISTA: "bg-green-100 text-green-700",
  REVISOR: "bg-amber-100 text-amber-700",
  MODERADOR: "bg-orange-100 text-orange-700",
  ANALISTA: "bg-gray-100 text-gray-700",
};

const ACTION_LABEL: Record<string, string> = {
  submitted: "submeteu artigo",
  submitted_for_review: "enviou para revisão",
  rejected: "recusou",
  approved: "aprovou",
  published: "publicou",
  archived: "arquivou",
  deleted: "eliminou",
  created: "criou",
  updated: "actualizou",
  invited: "convidou utilizador",
  role_changed: "alterou role de",
  status_changed: "alterou estado de",
};

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/_/g, " ");
}

function roleShort(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super";
    case "EDITOR_CHEFE":
      return "Editor-Chefe";
    case "EDITOR":
      return "Editor";
    case "JORNALISTA":
      return "Jornalista";
    case "REVISOR":
      return "Revisor";
    case "MODERADOR":
      return "Moderador";
    case "ANALISTA":
      return "Analista";
    default:
      return role;
  }
}

interface MeWithPerms {
  id: string;
  email: string;
  name: string | null;
  role: string;
  permissions: string[];
}

interface RejectedArticleItem {
  id: string;
  title: string;
  slug: string;
  rejectionReason: string | null;
  updatedAt: string;
  category: { slug: string; name: string } | null;
}

async function loadDashboard() {
  const [statsRes, activityRes, pendingRes, rejectedRes, meRes, readerStatsRes] =
    await Promise.all([
      apiFetch("/admin/stats"),
      apiFetch("/admin/activity?pageSize=8"),
      apiFetch("/admin/articles?status=EM_REVISAO,AGENDADO&pageSize=6"),
      apiFetch("/admin/articles/my-rejected"),
      apiFetch("/auth/me"),
      // Guarded by leitores.ver on the API. A 403 here is the normal
      // answer for most of the newsroom, not an error — how many people
      // pay for the paper is not a number for everyone who can log in.
      apiFetch("/admin/readers/stats"),
    ]);
  const stats = statsRes.ok ? ((await statsRes.json()) as StatsResponse) : null;
  const activity = activityRes.ok
    ? ((await activityRes.json()) as PageResult<ActivityItem>)
    : { items: [], total: 0, page: 1, pageSize: 8 };
  const pending = pendingRes.ok
    ? ((await pendingRes.json()) as PageResult<PendingArticleItem>)
    : { items: [], total: 0, page: 1, pageSize: 4 };
  const rejected: RejectedArticleItem[] = rejectedRes.ok
    ? ((await rejectedRes.json()) as RejectedArticleItem[])
    : [];
  const me = meRes.ok ? ((await meRes.json()) as MeWithPerms) : null;
  const canApprove =
    me?.role === "SUPER_ADMIN" ||
    me?.permissions?.includes("artigos.aprovar") ||
    false;
  const readerStats = readerStatsRes.ok
    ? ((await readerStatsRes.json()) as ReaderStats)
    : null;
  return { stats, activity, pending, rejected, canApprove, readerStats };
}

export default async function AdminDashboardPage() {
  const { stats, activity, pending, rejected, canApprove, readerStats } =
    await loadDashboard();

  const statCards = [
    {
      label: "Artigos publicados",
      value: intFmt.format(stats?.articles.published ?? 0),
      change: `${stats?.articles.total ?? 0} no total`,
      cardClass: "bg-blue-50 border-blue-200",
      accent: "text-[#0F2C6B]",
      changeClass: "text-gray-500",
    },
    {
      label: "Utilizadores registados",
      value: intFmt.format(stats?.users.total ?? 0),
      change: "Equipa editorial",
      cardClass: "bg-green-50 border-green-200",
      accent: "text-green-700",
      changeClass: "text-gray-500",
    },
    {
      label: "Visitas hoje",
      value: intFmt.format(stats?.visits.today ?? 0),
      change: `${intFmt.format(stats?.visits.week ?? 0)} esta semana · ${intFmt.format(stats?.visits.month ?? 0)} no mês`,
      cardClass: "bg-purple-50 border-purple-200",
      accent: "text-purple-700",
      changeClass: "text-gray-500",
    },
    {
      label: "Artigos pendentes",
      value: intFmt.format(stats?.articles.pending ?? 0),
      change: "Aguardam aprovação",
      cardClass: "bg-amber-50 border-amber-200",
      accent: "text-amber-700",
      changeClass: "text-amber-600",
    },
  ];

  return (
    <AdminShell active="/admin">
      <main className="bg-[#f6f7fb] p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-black text-[#0F2C6B]">
            Painel de Controlo
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">{formatToday()}</p>
        </header>

        {/* Rejected-back-to-draft banner. Shows ONLY to the author of
            the affected articles and ONLY when there's at least one,
            so the dashboard stays tidy for everyone else. The motive
            here is that without this banner a journalist would see
            their submitted article silently return to RASCUNHO and
            never know an editor flagged it — they'd think it was
            just a draft they forgot. */}
        {rejected.length > 0 && (
          <section className="mb-6 rounded-2xl border-l-4 border-amber-400 bg-amber-50 p-5">
            <div className="mb-3 flex items-start gap-3">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white"
              >
                ⚠
              </span>
              <div>
                <h2 className="text-sm font-black text-amber-900">
                  {rejected.length === 1
                    ? "Tem 1 artigo devolvido para revisão"
                    : `Tem ${rejected.length} artigos devolvidos para revisão`}
                </h2>
                <p className="mt-0.5 text-xs text-amber-800">
                  Um editor enviou estes artigos de volta para rascunho.
                  Reveja o motivo e submeta novamente quando estiverem
                  prontos.
                </p>
              </div>
            </div>
            <ul className="space-y-2">
              {rejected.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-amber-200 bg-white p-4"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                    {r.category && (
                      <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-amber-800">
                        {r.category.name}
                      </span>
                    )}
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-400">
                      Devolvido {relativeTime(r.updatedAt)}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{r.title}</p>
                  {r.rejectionReason && (
                    <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                      <span className="font-bold">Motivo: </span>
                      <span className="italic">
                        “{r.rejectionReason}”
                      </span>
                    </div>
                  )}
                  <div className="mt-3 flex justify-end">
                    <a
                      href={`/admin/artigos?edit=${r.id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-700"
                    >
                      Editar e ressubmeter →
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          {statCards.map((s) => (
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

        {readerStats && (
          <SubscriptionsPanel s={readerStats.subscriptions} />
        )}

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
                {intFmt.format(pending.total)} pendentes
              </span>
            </header>
            {pending.items.length === 0 ? (
              <p className="px-5 py-10 text-center text-xs text-gray-400">
                Nenhum artigo aguarda aprovação.
              </p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {pending.items.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-4 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wide text-[#0F2C6B]">
                          {a.category?.name ?? "—"}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            a.status === "AGENDADO"
                              ? "bg-blue-100 text-blue-700"
                              : a.status === "EM_REVISAO"
                                ? "bg-purple-100 text-purple-700"
                                : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {a.status === "AGENDADO"
                            ? "Agendado"
                            : a.status === "EM_REVISAO"
                              ? "Em revisão"
                              : "Rascunho"}
                        </span>
                        <span className="text-[10px] text-gray-300">
                          {relativeTime(a.createdAt)}
                        </span>
                      </div>
                      <p className="truncate text-sm font-semibold text-gray-800">
                        {a.title}
                      </p>
                      <p className="text-xs text-gray-400">
                        {a.author?.name ?? a.author?.email ?? "—"}
                      </p>
                    </div>
                    <DashboardActions
                      articleId={a.id}
                      articleTitle={a.title}
                      canApprove={canApprove}
                    />
                  </li>
                ))}
              </ul>
            )}
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
            {activity.items.length === 0 ? (
              <p className="px-5 py-10 text-center text-xs text-gray-400">
                Sem actividade registada ainda.
              </p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {activity.items.map((a) => (
                  <li key={a.id} className="px-5 py-3.5">
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          ROLE_BADGE[a.user?.role ?? ""] ??
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {roleShort(a.user?.role ?? "—").split("-")[0]}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs leading-relaxed text-gray-800">
                          <span className="font-bold">
                            {a.user?.name ?? a.user?.email ?? "Sistema"}
                          </span>{" "}
                          <span className="text-gray-500">
                            {actionLabel(a.action)}
                          </span>{" "}
                          <span className="font-semibold text-[#0F2C6B]">
                            “{a.targetLabel}”
                          </span>
                        </p>
                        <p className="mt-0.5 text-[10px] text-gray-400">
                          {relativeTime(a.createdAt)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </AdminShell>
  );
}
