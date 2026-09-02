"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  grantSubscriptionAction,
  revokeSubscriptionAction,
  suspendReaderAction,
  unsuspendReaderAction,
} from "./actions";
import { BanReaderDialog } from "@/components/admin/BanReaderDialog";
import { GrantSubscriptionDialog } from "@/components/admin/GrantSubscriptionDialog";

export interface AdminReader {
  id: string;
  email: string;
  name: string | null;
  status: "PENDENTE_VERIFICACAO" | "ATIVO" | "SUSPENSO" | "ANONIMIZADO";
  plan: "GRATIS" | "PREMIUM";
  planStatus: string | null;
  planRenewsAt: string | null;
  /** True when planRenewsAt is the END, not the next renewal. */
  planCancelAtPeriodEnd: boolean;
  /** When they asked to cancel. NULL if they never did. */
  planCanceledAt: string | null;
  planSource: "MANUAL" | "STRIPE" | null;
  planNote: string | null;
  planGrantedBy: { id: string; name: string | null } | null;
  /** Computed server-side: the plan is PREMIUM and has not lapsed. */
  planActive: boolean;
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

export interface SubscriptionStats {
  /** Live right now, counted by date. NOT the same as plan.PREMIUM. */
  active: number;
  paid: number;
  gifted: number;
  /** On PREMIUM with an end date already passed, awaiting tidy-up. */
  lapsed: number;
  free: number;
  newRecently: number;
  newWindowDays: number;
  expiringSoon: number;
  expiryHorizonDays: number;
  expiring: {
    id: string;
    name: string | null;
    email: string;
    planRenewsAt: string | null;
    planNote: string | null;
  }[];
  /** Cancellations inside the window, counted by the day they cancelled. */
  cancelledRecently: number;
  cancelledWindowDays: number;
  /** Of those, the ones whose paid period has not run out yet. */
  cancelledInGrace: number;
  cancelled: {
    id: string;
    name: string | null;
    email: string;
    /** When they asked to cancel. */
    planCanceledAt: string | null;
    /** When access actually stops. */
    planRenewsAt: string | null;
    planSource: "MANUAL" | "STRIPE" | null;
    /**
     * Computed server-side, against the server's clock. Not derived
     * here: rendering must not read the time, and the browser's clock
     * can be minutes or a whole timezone out.
     */
    stillReading: boolean;
    daysLeft: number | null;
  }[];
}

export interface ReaderStats {
  total: number;
  plan: Record<string, number>;
  status: Record<string, number>;
  bannedNow: number;
  subscriptions: SubscriptionStats;
}

/**
 * How far back the cancellations list may look.
 *
 * Mirrors CANCELLED_WINDOWS in readers.service.ts — the API only accepts
 * these three, so offering a fourth here would produce a 400.
 */
const WINDOWS = [
  { days: 30, label: "30d" },
  { days: 180, label: "6 meses" },
  { days: 365, label: "1 ano" },
] as const;

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
  canGrant,
}: {
  items: AdminReader[];
  total: number;
  stats: ReaderStats;
  currentPage: number;
  pageSize: number;
  filters: {
    q: string;
    plan: string;
    status: string;
    suspended: boolean;
    active: boolean;
    newPlans: boolean;
    expiring: boolean;
    cancelled: boolean;
    /** How far back the cancellations list looks: 30, 180 or 365. */
    cancelledDays: string;
    inGrace: boolean;
  };
  canBan: boolean;
  canGrant: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(filters.q);
  const [banning, setBanning] = useState<AdminReader | null>(null);
  const [granting, setGranting] = useState<AdminReader | null>(null);

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
      active: filters.active ? "true" : "",
      newPlans: filters.newPlans ? "true" : "",
      expiring: filters.expiring ? "true" : "",
      cancelled: filters.cancelled ? "true" : "",
      // Only meaningful alongside `cancelled`; carried separately so
      // changing the window keeps the filter itself on.
      cancelledDays: filters.cancelled ? filters.cancelledDays : "",
      inGrace: filters.inGrace ? "true" : "",
      page: String(currentPage),
      ...patch,
    };
    for (const [k, v] of Object.entries(base)) if (v) next[k] = v;
    router.push(`/admin/leitores?${new URLSearchParams(next).toString()}`);
  }

  /**
   * Every chip clears the others.
   *
   * They answer overlapping questions about the same column — "assinante
   * agora" and "a expirar" both match a subscriber — so leaving one on
   * while clicking another produces an intersection nobody asked for.
   * The search box is deliberately NOT cleared: filtering the expiring
   * list down to one name is exactly what it is for.
   */
  const CLEAR = {
    plan: "",
    status: "",
    suspended: "",
    active: "",
    newPlans: "",
    expiring: "",
    cancelled: "",
    cancelledDays: "",
    inGrace: "",
    page: "1",
  };

  const noFilter =
    !filters.plan &&
    !filters.status &&
    !filters.suspended &&
    !filters.active &&
    !filters.newPlans &&
    !filters.expiring &&
    !filters.cancelled &&
    !filters.inGrace;

  const CARDS = [
    { label: "Total", value: stats.total, tone: "text-[#0F2C6B]" },
    {
      // The live count, not plan.PREMIUM: a row keeps saying PREMIUM
      // after its end date until somebody's next request tidies it.
      label: "Assinantes",
      value: stats.subscriptions.active,
      tone: "text-amber-600",
    },
    {
      label: "Gratuitos",
      value: stats.subscriptions.free,
      tone: "text-gray-700",
    },
    {
      label: "Por confirmar",
      value: stats.status.PENDENTE_VERIFICACAO ?? 0,
      tone: "text-gray-500",
    },
    { label: "Suspensos", value: stats.bannedNow, tone: "text-red-600" },
  ];

  return (
    <main className="bg-[#f6f7fb] p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#0F2C6B]">Leitores</h1>
          <p className="mt-1 text-sm text-gray-500">
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
            className="h-9 w-56 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-[#0F2C6B] focus:ring-2 focus:ring-[#0F2C6B]/10"
          />
          <button
            type="submit"
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
          >
            Procurar
          </button>
        </form>
      </header>

      {/* Counts across the whole table, not this page — otherwise they
          would change every time somebody clicks Seguinte. */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {CARDS.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {c.label}
            </p>
            <p className={`text-2xl font-black ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <nav className="mb-4 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
        <Chip on={noFilter} onClick={() => goto(CLEAR)}>
          Todos
        </Chip>
        {/* `active`, not `plan=PREMIUM`. The raw column also matches
            whoever's subscription ended without them signing in since,
            and this chip has to show the same people the dashboard
            counted. */}
        <Chip
          on={filters.active}
          onClick={() => goto({ ...CLEAR, active: "true" })}
        >
          Assinantes
        </Chip>
        <Chip
          on={filters.plan === "GRATIS"}
          onClick={() => goto({ ...CLEAR, plan: "GRATIS" })}
        >
          Gratuitos
        </Chip>

        <span aria-hidden className="mx-1 h-5 w-px bg-gray-200" />

        {/* The two campaign lists: who just joined, and who is about to
            leave. Both exist to be exported into a mailing. */}
        <Chip
          on={filters.newPlans}
          onClick={() => goto({ ...CLEAR, newPlans: "true" })}
        >
          Novas (30 dias)
        </Chip>
        <Chip
          on={filters.expiring}
          onClick={() => goto({ ...CLEAR, expiring: "true" })}
        >
          A expirar (30 dias)
        </Chip>
        {/* Churn. Separate from "a expirar", which is only about gifts
            running out — this is people who chose to leave. */}
        <Chip
          on={filters.cancelled}
          onClick={() =>
            goto({ ...CLEAR, cancelled: "true", cancelledDays: "30" })
          }
        >
          Cancelaram
        </Chip>
        {/* Only offered once the cancellations list is on: on its own it
            would be a third overlapping question about the same rows. */}
        {filters.cancelled && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-gray-100 p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w.days}
                type="button"
                onClick={() =>
                  goto({
                    cancelled: "true",
                    cancelledDays: String(w.days),
                    page: "1",
                  })
                }
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  filters.cancelledDays === String(w.days)
                    ? "bg-white text-[#0F2C6B] shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {w.label}
              </button>
            ))}
          </span>
        )}
        {/* The ones there is still time to write to. */}
        <Chip
          on={filters.inGrace}
          onClick={() => goto({ ...CLEAR, inGrace: "true" })}
        >
          Ainda a ler
        </Chip>

        <span aria-hidden className="mx-1 h-5 w-px bg-gray-200" />

        <Chip
          on={filters.status === "PENDENTE_VERIFICACAO"}
          onClick={() => goto({ ...CLEAR, status: "PENDENTE_VERIFICACAO" })}
        >
          Por confirmar
        </Chip>
        {/* Not status=SUSPENSO: that also matches whoever served their
            ban and is free to comment again. This asks the date. */}
        <Chip
          on={filters.suspended}
          onClick={() => goto({ ...CLEAR, suspended: "true" })}
        >
          Suspensos agora
        </Chip>
      </nav>

      {/* These filters exist to write to the people in them, so hand
          over the addresses rather than making somebody copy them out of
          the rows one at a time. */}
      {(filters.expiring || filters.cancelled || filters.inGrace) &&
        items.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-900">
              {filters.expiring && (
                <>
                  <strong>{total}</strong>{" "}
                  {total === 1
                    ? "assinatura oferecida termina"
                    : "assinaturas oferecidas terminam"}{" "}
                  nos próximos 30 dias.
                </>
              )}
              {filters.cancelled && (
                <>
                  <strong>{total}</strong>{" "}
                  {total === 1 ? "cancelamento" : "cancelamentos"} em{" "}
                  {WINDOWS.find((w) => String(w.days) === filters.cancelledDays)
                    ?.label ?? "30d"}
                  .
                </>
              )}
              {filters.inGrace && (
                <>
                  <strong>{total}</strong>{" "}
                  {total === 1
                    ? "cancelou e ainda está a ler"
                    : "cancelaram e ainda estão a ler"}{" "}
                  — dá para lhes falar enquanto ainda são assinantes.
                </>
              )}
            </p>
            <a
              href={`mailto:?bcc=${items.map((r) => encodeURIComponent(r.email)).join(",")}`}
              className="ml-auto rounded-lg bg-[#0F2C6B] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#1A3A7A]"
            >
              Escrever a esta página ({items.length})
            </a>
          </div>
        )}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400 shadow-sm">
          Nenhum leitor corresponde a estes filtros.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0F2C6B] text-xs font-black text-[#FFCC66]">
                {initials(r.name, r.email)}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-gray-800">
                    {r.name ?? "Sem nome"}
                  </span>
                  {/* `planActive`, not `plan`. A row can still say
                      PREMIUM past its end date — the plan lapses by
                      comparison, tidied when the reader next signs in.
                      Showing it as an active subscription would be the
                      admin list disagreeing with the paywall. */}
                  {r.planActive && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                      {r.planSource === "MANUAL" ? "oferecida" : "assinante"}
                      {r.planRenewsAt
                        ? ` · até ${WHEN.format(new Date(r.planRenewsAt))}`
                        : ""}
                    </span>
                  )}
                  {/* Cancelled but still reading. Worth its own badge:
                      the row above says "assinante · até 2 out", which
                      on its own reads like a renewal date and hides the
                      one fact somebody scanning this list needs. A gift
                      is excluded — it also never renews, but nobody
                      cancelled it. */}
                  {r.planActive &&
                    r.planCancelAtPeriodEnd &&
                    r.planSource !== "MANUAL" && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                        cancelada
                        {r.planCanceledAt
                          ? ` · ${WHEN.format(new Date(r.planCanceledAt))}`
                          : ""}
                      </span>
                    )}
                  {r.plan === "PREMIUM" && !r.planActive && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                      assinatura expirada
                    </span>
                  )}
                  {r.suspended && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                      {r.suspendedUntil
                        ? `até ${WHEN.format(new Date(r.suspendedUntil))}`
                        : "definitivo"}
                    </span>
                  )}
                  {!r.suspended && r.status !== "ATIVO" && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                      {STATUS_LABEL[r.status]}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-gray-400">{r.email}</p>
                {r.suspended && r.suspensionReason && (
                  <p className="mt-1 text-xs text-red-500">
                    {r.suspensionReason}
                    {r.suspendedBy?.name ? ` — ${r.suspendedBy.name}` : ""}
                  </p>
                )}
                {r.planActive && r.planSource === "MANUAL" && r.planNote && (
                  <p className="mt-1 text-xs text-amber-600">
                    {r.planNote}
                    {r.planGrantedBy?.name ? ` — ${r.planGrantedBy.name}` : ""}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end text-xs text-gray-400">
                <span>{r._count.comments} comentários</span>
                <span>desde {WHEN.format(new Date(r.createdAt))}</span>
              </div>

              {canGrant && r.status !== "ANONIMIZADO" && (
                <div className="shrink-0">
                  {r.planActive ? (
                    // Only a gift can be taken back here. The API refuses
                    // to touch a Stripe subscription, which belongs to
                    // the reader's own billing portal.
                    r.planSource === "MANUAL" ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(() => revokeSubscriptionAction(r.id))}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                      >
                        Retirar
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">paga</span>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setGranting(r)}
                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                    >
                      Oferecer
                    </button>
                  )}
                </div>
              )}

              {canBan && r.status !== "ANONIMIZADO" && (
                <div className="shrink-0">
                  {r.suspended ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => unsuspendReaderAction(r.id))}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                      Levantar
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setBanning(r)}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
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

      {granting && (
        <GrantSubscriptionDialog
          readerLabel={granting.name ?? granting.email}
          busy={isPending}
          onCancel={() => setGranting(null)}
          onConfirm={(opts) => {
            const id = granting.id;
            setGranting(null);
            run(() => grantSubscriptionAction(id, opts));
          }}
        />
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => goto({ page: String(currentPage - 1) })}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-30"
          >
            ← Anterior
          </button>
          <span className="text-sm text-gray-500">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => goto({ page: String(currentPage + 1) })}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-30"
          >
            Seguinte →
          </button>
        </div>
      )}
    </main>
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
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        on
          ? "bg-[#0F2C6B] text-white"
          : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}
