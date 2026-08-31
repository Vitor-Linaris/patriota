"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { suspendReaderAction, unsuspendReaderAction } from "./actions";
import { BanReaderDialog } from "@/components/admin/BanReaderDialog";

export interface AdminReader {
  id: string;
  email: string;
  name: string | null;
  status: "PENDENTE_VERIFICACAO" | "ATIVO" | "SUSPENSO" | "ANONIMIZADO";
  plan: "GRATIS" | "PREMIUM";
  planStatus: string | null;
  planRenewsAt: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  suspendedUntil: string | null;
  suspensionReason: string | null;
  suspendedBy: { id: string; name: string | null } | null;
  /**
   * Computed by the server from status + date. Not derived here: the rule
   * for "is this person banned right now" lives in one place, and a row
   * saying SUSPENSO with last week's date is not a ban.
   */
  suspended: boolean;
  _count: { comments: number };
}

export interface ReaderStats {
  total: number;
  plan: Record<string, number>;
  status: Record<string, number>;
  bannedNow: number;
}

const WHEN = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const STATUS_LABEL: Record<AdminReader["status"], string> = {
  PENDENTE_VERIFICACAO: "Por confirmar",
  ATIVO: "Activo",
  SUSPENSO: "Suspenso",
  ANONIMIZADO: "Apagado",
};

function initials(name: string | null, email: string): string {
  const source = (name ?? email).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AdminReadersClient({
  items,
  total,
  stats,
  currentPage,
  pageSize,
  filters,
  canBan,
}: {
  items: AdminReader[];
  total: number;
  stats: ReaderStats;
  currentPage: number;
  pageSize: number;
  filters: { q: string; plan: string; status: string; suspended: boolean };
  canBan: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(filters.q);
  const [banning, setBanning] = useState<AdminReader | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Falha na operação.");
      else router.refresh();
    });
  }

  /** Builds the next URL from the current filters plus an override. */
  function goto(patch: Record<string, string | undefined>) {
    const next: Record<string, string> = {};
    const base = {
      q: search,
      plan: filters.plan,
      status: filters.status,
      suspended: filters.suspended ? "true" : "",
      page: String(currentPage),
      ...patch,
    };
    for (const [k, v] of Object.entries(base)) if (v) next[k] = v;
    router.push(`/admin/leitores?${new URLSearchParams(next).toString()}`);
  }

  const CARDS = [
    { label: "Total", value: stats.total, tone: "text-white" },
    {
      label: "Assinantes",
      value: stats.plan.PREMIUM ?? 0,
      tone: "text-amber-300",
    },
    {
      label: "Gratuitos",
      value: stats.plan.GRATIS ?? 0,
      tone: "text-white/80",
    },
    {
      label: "Por confirmar",
      value: stats.status.PENDENTE_VERIFICACAO ?? 0,
      tone: "text-white/60",
    },
    { label: "Suspensos", value: stats.bannedNow, tone: "text-red-300" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-black text-white">Leitores</h1>
          <p className="mt-1 text-[13px] text-white/50">
            As contas do público. A equipa da redacção está em Utilizadores.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            goto({ page: "1", suspended: "" });
          }}
          className="flex gap-2"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome ou e-mail…"
            className="h-9 w-56 rounded-[8px] border border-white/10 bg-white/5 px-3 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-patriota-accent/50"
          />
          <button
            type="submit"
            className="h-9 rounded-[8px] border border-white/10 px-3 text-[13px] text-white/70 transition hover:border-white/30 hover:text-white"
          >
            Procurar
          </button>
        </form>
      </header>

      {/* Counts across the whole table, not this page — otherwise they
          would change every time somebody clicks Seguinte. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {CARDS.map((c) => (
          <div
            key={c.label}
            className="rounded-[10px] border border-white/10 bg-white/[0.02] p-3.5"
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/40">
              {c.label}
            </p>
            <p className={`mt-1 text-[22px] font-black ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        <Chip
          on={!filters.plan && !filters.status && !filters.suspended}
          onClick={() => goto({ plan: "", status: "", suspended: "", page: "1" })}
        >
          Todos
        </Chip>
        <Chip
          on={filters.plan === "PREMIUM"}
          onClick={() =>
            goto({ plan: "PREMIUM", status: "", suspended: "", page: "1" })
          }
        >
          Assinantes
        </Chip>
        <Chip
          on={filters.plan === "GRATIS"}
          onClick={() =>
            goto({ plan: "GRATIS", status: "", suspended: "", page: "1" })
          }
        >
          Gratuitos
        </Chip>
        <Chip
          on={filters.status === "PENDENTE_VERIFICACAO"}
          onClick={() =>
            goto({
              status: "PENDENTE_VERIFICACAO",
              plan: "",
              suspended: "",
              page: "1",
            })
          }
        >
          Por confirmar
        </Chip>
        {/* Not status=SUSPENSO: that also matches whoever served their
            ban and is free to comment again. This asks the date. */}
        <Chip
          on={filters.suspended}
          onClick={() =>
            goto({ suspended: "true", plan: "", status: "", q: "", page: "1" })
          }
        >
          Suspensos agora
        </Chip>
      </nav>

      {filters.suspended && (
        <p className="text-[12px] text-white/40">
          A pesquisa por texto está desligada enquanto este filtro estiver
          activo.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-[8px] border border-red-400/30 bg-red-500/10 px-4 py-2 text-[13px] text-red-200"
        >
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-[10px] border border-white/10 bg-white/[0.02] px-4 py-8 text-center text-[14px] text-white/40">
          Nenhum leitor corresponde a estes filtros.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-[10px] border border-white/10 bg-white/[0.02] p-3.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-bold text-white/70">
                {initials(r.name, r.email)}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-bold text-white">
                    {r.name ?? "Sem nome"}
                  </span>
                  {r.plan === "PREMIUM" && (
                    <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                      assinante
                    </span>
                  )}
                  {r.suspended && (
                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
                      {r.suspendedUntil
                        ? `até ${WHEN.format(new Date(r.suspendedUntil))}`
                        : "definitivo"}
                    </span>
                  )}
                  {!r.suspended && r.status !== "ATIVO" && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
                      {STATUS_LABEL[r.status]}
                    </span>
                  )}
                </div>
                <p className="truncate text-[12px] text-white/40">{r.email}</p>
                {r.suspended && r.suspensionReason && (
                  <p className="mt-1 text-[12px] text-red-300/70">
                    {r.suspensionReason}
                    {r.suspendedBy?.name ? ` — ${r.suspendedBy.name}` : ""}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end text-[12px] text-white/40">
                <span>{r._count.comments} comentários</span>
                <span>desde {WHEN.format(new Date(r.createdAt))}</span>
              </div>

              {canBan && r.status !== "ANONIMIZADO" && (
                <div className="shrink-0">
                  {r.suspended ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => unsuspendReaderAction(r.id))}
                      className="rounded-[8px] border border-white/20 px-3 py-1.5 text-[12px] text-white/70 transition hover:border-white/40 disabled:opacity-50"
                    >
                      Levantar
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setBanning(r)}
                      className="rounded-[8px] border border-red-400/30 px-3 py-1.5 text-[12px] text-red-300 transition hover:border-red-400/60 disabled:opacity-50"
                    >
                      Suspender
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {banning && (
        <BanReaderDialog
          readerLabel={banning.name ?? banning.email}
          busy={isPending}
          onCancel={() => setBanning(null)}
          onConfirm={(duration, opts) => {
            const id = banning.id;
            setBanning(null);
            run(() => suspendReaderAction(id, duration, opts));
          }}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => goto({ page: String(currentPage - 1) })}
            className="rounded-[8px] border border-white/10 px-3 py-1.5 text-[13px] text-white/70 transition hover:border-white/30 disabled:opacity-30"
          >
            ← Anterior
          </button>
          <span className="text-[13px] text-white/50">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => goto({ page: String(currentPage + 1) })}
            className="rounded-[8px] border border-white/10 px-3 py-1.5 text-[13px] text-white/70 transition hover:border-white/30 disabled:opacity-30"
          >
            Seguinte →
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
        on
          ? "bg-patriota-accent text-patriota-ink"
          : "border border-white/10 text-white/60 hover:border-white/30 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
