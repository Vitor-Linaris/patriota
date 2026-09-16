"use client";

/** Mirrors ReaderSanctionKind in the Prisma schema. */
export type SanctionKind =
  | "ADVERTENCIA"
  | "SUSPENSAO"
  | "PERMANENTE"
  | "LEVANTAMENTO";

export interface SanctionEntry {
  id: string;
  kind: SanctionKind;
  reason: string | null;
  until: string | null;
  actorLabel: string;
  createdAt: string;
}

export interface ReaderHistoryData {
  entries: SanctionEntry[];
  /** Offences only — a lifted suspension does not count against anyone. */
  total: number;
  warnings: number;
  suspensions: number;
  /** What the API suggests next. A suggestion, never applied on its own. */
  suggested: "ADVERTENCIA" | "DIAS_15" | "DIAS_30" | "PERMANENTE";
}

const KIND_LABEL: Record<SanctionKind, string> = {
  ADVERTENCIA: "Advertência",
  SUSPENSAO: "Suspensão",
  PERMANENTE: "Suspensão definitiva",
  LEVANTAMENTO: "Suspensão levantada",
};

const KIND_TONE: Record<SanctionKind, string> = {
  ADVERTENCIA: "bg-amber-50 text-amber-700 ring-amber-200",
  SUSPENSAO: "bg-orange-50 text-orange-700 ring-orange-200",
  PERMANENTE: "bg-red-50 text-red-700 ring-red-200",
  LEVANTAMENTO: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const DATE = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/**
 * What has already been done to this person, and by whom.
 *
 * The whole reason this exists: "suspender 15 dias" and "definitivo" are
 * the same two clicks apart whether it is somebody's first bad day or
 * their fourth. Without the history on screen at the moment of deciding,
 * the escalation the newsroom wants lives only in whichever moderator
 * happens to remember the name — and a reader who was warned twice last
 * month gets treated as new by whoever is on duty tonight.
 */
export function ReaderHistory({
  data,
  loading,
}: {
  data: ReaderHistoryData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-400">
        A carregar o histórico…
      </p>
    );
  }
  if (!data) return null;

  if (data.total === 0) {
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
        Sem registos anteriores — é a primeira ocorrência deste leitor.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60">
      <p className="px-3 pt-2.5 text-xs font-bold text-amber-900">
        {data.total}{" "}
        {data.total === 1 ? "ocorrência anterior" : "ocorrências anteriores"}
        {data.warnings > 0 && ` · ${data.warnings} advertência(s)`}
        {data.suspensions > 0 && ` · ${data.suspensions} suspensão(ões)`}
      </p>
      <ul className="max-h-44 overflow-y-auto px-3 pb-2.5 pt-2">
        {data.entries.map((e) => (
          <li
            key={e.id}
            className="border-b border-amber-200/60 py-1.5 last:border-0"
          >
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ${KIND_TONE[e.kind]}`}
              >
                {KIND_LABEL[e.kind]}
              </span>
              <span className="text-[11px] text-amber-900/70">
                {DATE.format(new Date(e.createdAt))}
                {e.until && ` · até ${DATE.format(new Date(e.until))}`}
              </span>
            </div>
            {e.reason && (
              <p className="mt-0.5 text-[11px] leading-snug text-amber-900">
                “{e.reason}”
              </p>
            )}
            {/* Who acted, not just what happened. A history that cannot
                say who decided is a history somebody can argue with and
                nobody can answer. */}
            <p className="text-[10px] text-amber-900/50">{e.actorLabel}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
