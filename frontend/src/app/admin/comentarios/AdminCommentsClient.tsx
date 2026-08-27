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
} from "./actions";

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
  reader: { id: string; name: string | null; email: string; status: string };
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

export default function AdminCommentsClient({
  items,
  total,
  stats,
  activeStatus,
  currentPage,
  query,
}: {
  items: ModerationComment[];
  total: number;
  stats: CommentStats;
  activeStatus: string;
  currentPage: number;
  query: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(query);

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
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-black text-white">Comentários</h1>
          <p className="mt-1 text-[13px] text-white/50">
            Moderação dos comentários dos leitores.
            {stats.REPORTADOS > 0 && (
              <span className="ml-2 text-amber-300">
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

      {/* Status tabs with live counts */}
      <nav className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {TABS.map((t) => {
          const count = stats[t.key] ?? 0;
          const on = activeStatus === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => goto({ status: t.key, page: "1" })}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                on
                  ? "bg-patriota-accent text-patriota-ink"
                  : "border border-white/10 text-white/60 hover:border-white/30 hover:text-white"
              }`}
            >
              {t.label}
              <span
                className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${
                  on ? "bg-black/15" : "bg-white/10"
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
          className="rounded-[8px] border border-red-400/30 bg-red-500/10 px-4 py-2 text-[13px] text-red-200"
        >
          {error}
        </p>
      )}

      {/* Bulk bar — only when something is picked, so it never adds noise */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-patriota-accent/30 bg-patriota-accent/10 px-4 py-2.5">
          <span className="text-[13px] font-medium text-white">
            {selected.size} seleccionado{selected.size > 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(() => bulkModerateAction([...selected], "APROVADO"))
              }
              className="rounded-[8px] bg-emerald-500/90 px-3 py-1.5 text-[12px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              Aprovar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(() => bulkModerateAction([...selected], "REJEITADO"))
              }
              className="rounded-[8px] border border-white/20 px-3 py-1.5 text-[12px] text-white/80 transition hover:border-white/40 disabled:opacity-50"
            >
              Rejeitar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => bulkModerateAction([...selected], "SPAM"))}
              className="rounded-[8px] border border-white/20 px-3 py-1.5 text-[12px] text-white/80 transition hover:border-white/40 disabled:opacity-50"
            >
              Spam
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-[10px] border border-white/10 bg-white/[0.02] px-5 py-10 text-center text-[14px] text-white/40">
          Sem comentários nesta vista.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => (
            <li
              key={c.id}
              className="rounded-[10px] border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  aria-label="Seleccionar comentário"
                  className="mt-1 h-4 w-4 shrink-0 accent-patriota-accent"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="font-bold text-white">
                      {c.reader.name ?? "Leitor"}
                    </span>
                    <span className="text-white/40">{c.reader.email}</span>
                    <span className="text-white/30">
                      {WHEN.format(new Date(c.createdAt))}
                    </span>
                    {c.editedAt && (
                      <span className="text-white/30">· editado</span>
                    )}
                    {c.parentId && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
                        resposta
                      </span>
                    )}
                    {c.reportCount > 0 && (
                      <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                        {c.reportCount} denúncia{c.reportCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {/* Plain text. Never dangerouslySetInnerHTML — the body
                      is reader-supplied. */}
                  <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-white/85">
                    {c.body}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                    <Link
                      href={`/artigo/${c.article.slug}#comentarios`}
                      target="_blank"
                      className="text-patriota-accent/80 transition hover:text-patriota-accent"
                    >
                      {c.article.title}
                    </Link>
                    {c.moderatedBy && (
                      <span className="text-white/30">
                        · moderado por {c.moderatedBy.name ?? "—"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-1.5">
                  {c.status !== "APROVADO" && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => approveCommentAction(c.id))}
                      className="rounded-[8px] bg-emerald-500/90 px-3 py-1.5 text-[12px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                    >
                      Aprovar
                    </button>
                  )}
                  {c.status !== "REJEITADO" && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => rejectCommentAction(c.id))}
                      className="rounded-[8px] border border-white/20 px-3 py-1.5 text-[12px] text-white/80 transition hover:border-white/40 disabled:opacity-50"
                    >
                      Rejeitar
                    </button>
                  )}
                  {c.status !== "SPAM" && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => spamCommentAction(c.id))}
                      className="rounded-[8px] border border-white/20 px-3 py-1.5 text-[12px] text-white/60 transition hover:border-white/40 disabled:opacity-50"
                    >
                      Spam
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => deleteCommentAction(c.id))}
                    className="rounded-[8px] border border-red-400/30 px-3 py-1.5 text-[12px] text-red-300 transition hover:border-red-400/60 disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
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
