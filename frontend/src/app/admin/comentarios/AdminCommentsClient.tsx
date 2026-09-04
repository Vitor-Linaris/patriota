"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approveCommentAction,
  bulkModerateAction,
  deleteCommentAction,
  rejectCommentAction,
  spamCommentAction,
  suspendReaderAction,
  unsuspendReaderAction,
} from "./actions";
import { BanReaderDialog } from "@/components/admin/BanReaderDialog";

export interface ModerationComment {
  id: string;
  body: string;
  status: "PENDENTE" | "APROVADO" | "REJEITADO" | "SPAM" | "ELIMINADO";
  parentId: string | null;
  reportCount: number;
  createdAt: string;
  editedAt: string | null;
  moderatedAt: string | null;
  moderationNote: string | null;
  reader: {
    id: string;
    name: string | null;
    email: string;
    status: string;
    /** NULL alongside status SUSPENSO means the ban is permanent. */
    suspendedUntil: string | null;
  };
  moderatedBy: { id: string; name: string | null } | null;
  article: { slug: string; title: string };
}

export interface CommentStats {
  PENDENTE: number;
  APROVADO: number;
  REJEITADO: number;
  SPAM: number;
  ELIMINADO: number;
  REPORTADOS: number;
}

const TABS = [
  { key: "PENDENTE", label: "Pendentes" },
  { key: "APROVADO", label: "Aprovados" },
  { key: "REJEITADO", label: "Rejeitados" },
  { key: "SPAM", label: "Spam" },
] as const;

const WHEN = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DAY_MONTH = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/**
 * Whether the reader is banned RIGHT NOW.
 *
 * `status` alone cannot answer this: it still reads SUSPENSO after the
 * end date has passed, because nothing sweeps the column — the ban lapses
 * by comparison, at the checkpoint that next sees the row. Mirrors
 * isSuspended() in the backend's reader-suspension.ts.
 */
function bannedNow(reader: { status: string; suspendedUntil: string | null }) {
  if (reader.status !== "SUSPENSO") return false;
  if (reader.suspendedUntil === null) return true;
  return new Date(reader.suspendedUntil).getTime() > Date.now();
}

export default function AdminCommentsClient({
  items,
  total,
  stats,
  activeStatus,
  currentPage,
  query,
  canBan,
  canModerate,
  canDelete,
}: {
  items: ModerationComment[];
  total: number;
  stats: CommentStats;
  activeStatus: string;
  currentPage: number;
  query: string;
  /** leitores.suspender. Hides the control; the API enforces it anyway. */
  canBan: boolean;
  /** comentarios.aprovar — Aprovar/Rejeitar/Spam. */
  canModerate: boolean;
  /** comentarios.eliminar. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(query);
  const [banning, setBanning] = useState<ModerationComment["reader"] | null>(
    null,
  );

  const totalPages = Math.max(1, Math.ceil(total / 20));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Falha na operação.");
      else {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function goto(params: Record<string, string>) {
    const sp = new URLSearchParams({ status: activeStatus, ...params });
    if (search) sp.set("q", search);
    router.push(`/admin/comentarios?${sp.toString()}`);
  }

  return (
    <main className="bg-[#f6f7fb] p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#0F2C6B]">Comentários</h1>
          <p className="mt-1 text-sm text-gray-500">
            Moderação dos comentários dos leitores.
            {stats.REPORTADOS > 0 && (
              <span className="ml-2 font-semibold text-amber-600">
                {stats.REPORTADOS} com denúncias.
              </span>
            )}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            goto({ page: "1" });
          }}
          className="flex gap-2"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar no texto…"
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

      {/* Status tabs with live counts */}
      <nav className="mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        {TABS.map((t) => {
          const count = stats[t.key] ?? 0;
          const on = activeStatus === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => goto({ status: t.key, page: "1" })}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "bg-[#0F2C6B] text-white"
                  : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {t.label}
              <span
                className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${
                  on ? "bg-white/20" : "bg-gray-100 text-gray-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {/* Bulk bar — only when something is picked, so it never adds noise */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#0F2C6B]/20 bg-[#F0F2F7] px-4 py-2.5">
          <span className="text-sm font-medium text-[#0F2C6B]">
            {selected.size} seleccionado{selected.size > 1 ? "s" : ""}
          </span>
          {canModerate && (
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(() => bulkModerateAction([...selected], "APROVADO"))
                }
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                Aprovar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(() => bulkModerateAction([...selected], "REJEITADO"))
                }
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Rejeitar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => bulkModerateAction([...selected], "SPAM"))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Spam
              </button>
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-400 shadow-sm">
          Sem comentários nesta vista.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  aria-label="Seleccionar comentário"
                  className="mt-1 h-4 w-4 shrink-0 accent-[#0F2C6B]"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-gray-800">
                      {c.reader.name ?? "Leitor"}
                    </span>
                    <span className="text-gray-400">{c.reader.email}</span>
                    <span className="text-gray-300">
                      {WHEN.format(new Date(c.createdAt))}
                    </span>
                    {c.editedAt && (
                      <span className="text-gray-300">· editado</span>
                    )}
                    {c.parentId && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                        resposta
                      </span>
                    )}
                    {c.reportCount > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                        {c.reportCount} denúncia{c.reportCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {bannedNow(c.reader) && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                        {c.reader.suspendedUntil
                          ? `suspenso até ${DAY_MONTH.format(new Date(c.reader.suspendedUntil))}`
                          : "suspenso definitivamente"}
                      </span>
                    )}
                  </div>

                  {/* Plain text. Never dangerouslySetInnerHTML — the body
                      is reader-supplied. */}
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">
                    {c.body}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <Link
                      href={`/artigo/${c.article.slug}#comentarios`}
                      target="_blank"
                      className="font-medium text-[#0F2C6B] transition hover:underline"
                    >
                      {c.article.title}
                    </Link>
                    {c.moderatedBy && (
                      <span className="text-gray-400">
                        · moderado por {c.moderatedBy.name ?? "—"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-1.5">
                  {canModerate && c.status !== "APROVADO" && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => approveCommentAction(c.id))}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Aprovar
                    </button>
                  )}
                  {canModerate && c.status !== "REJEITADO" && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => rejectCommentAction(c.id))}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                      Rejeitar
                    </button>
                  )}
                  {canModerate && c.status !== "SPAM" && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => spamCommentAction(c.id))}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                      Spam
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => deleteCommentAction(c.id))}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      Eliminar
                    </button>
                  )}

                  {/* Separated from the comment actions above by a rule:
                      those three are about this comment, this one is
                      about the person who wrote it. */}
                  {canBan &&
                    (bannedNow(c.reader) ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          run(() => unsuspendReaderAction(c.reader.id))
                        }
                        className="mt-1 rounded-lg border-t border-gray-100 px-3 pt-2.5 text-xs text-gray-500 transition-colors hover:text-gray-800 disabled:opacity-50"
                      >
                        Levantar suspensão
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setBanning(c.reader)}
                        className="mt-1 rounded-lg border-t border-gray-100 px-3 pt-2.5 text-xs font-bold text-red-600 transition-colors hover:text-red-700 disabled:opacity-50"
                      >
                        Suspender leitor
                      </button>
                    ))}
                </div>
              </div>
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
