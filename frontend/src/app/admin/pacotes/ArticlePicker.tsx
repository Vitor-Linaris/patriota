"use client";

import { useCallback, useEffect, useState } from "react";
import { imageVariant } from "@/lib/images";
import { adminMediaUrl } from "@/lib/media-preview";
import {
  ARTICLE_STATUS_LABEL,
  REFUSED_MEMBER_STATUSES,
  type ArticleStatus,
  type PickableArticle,
} from "./types";

interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

/** Which statuses the picker offers, and in the order an editor wants. */
const STATUS_FILTERS: { value: "" | ArticleStatus; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "RASCUNHO", label: "Rascunho" },
  { value: "EM_REVISAO", label: "Em revisão" },
  { value: "PUBLICADO", label: "Publicado" },
];

function statusChip(status: ArticleStatus) {
  const tone =
    status === "PUBLICADO"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "RASCUNHO"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : status === "EM_REVISAO"
          ? "bg-sky-50 text-sky-700 ring-sky-200"
          : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${tone}`}
    >
      {ARTICLE_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Pick N articles for a pacote.
 *
 * There was no "choose several related records" UI in this admin before
 * this one — tags are free text and a category is a single <select> — so
 * this follows MediaLibraryModal, the closest thing: a client component
 * that fetches lazily on first open, through a Next proxy, because a
 * client component cannot read the httpOnly session cookie.
 *
 * Two things it does differently from that modal, both on purpose:
 *
 *   - Search is SERVER-side, debounced. The media modal filters one page
 *     of 100 in the browser, which is fine for a library and useless
 *     against the whole article archive.
 *   - DRAFTS are offered and are the expected choice. That is the entire
 *     editorial flow: write the pieces, file them into the pacote, and let
 *     publishing the pacote publish them. Every row therefore shows its
 *     status, so the editor knows what publishing will do.
 */
export function ArticlePicker({
  selectedIds,
  onChange,
  onClose,
}: {
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<PickableArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<"" | ArticleStatus>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 250ms: long enough that typing a headline is one request rather than
  // twenty, short enough that it does not feel stuck.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // A new query starts a new list rather than appending to the old one.
  useEffect(() => {
    setPage(1);
  }, [debounced, status]);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (debounced) params.set("q", debounced);
    if (status) params.set("status", status);

    fetch(`/api/admin/articles/proxy?${params.toString()}`, {
      cache: "no-store",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PageResult<PickableArticle>>;
      })
      .then((body) => {
        if (abort) return;
        // Refused statuses are dropped here as well as by the API, which
        // names them on save. Keeping them out of sight means the editor
        // never picks something only to be told no.
        const usable = body.items.filter(
          (a) => !REFUSED_MEMBER_STATUSES.includes(a.status),
        );
        setItems((prev) => (page === 1 ? usable : [...prev, ...usable]));
        setTotal(body.total);
      })
      .catch((e) => {
        if (!abort) setError((e as Error).message);
      })
      .finally(() => {
        if (!abort) setLoading(false);
      });
    return () => {
      abort = true;
    };
  }, [page, debounced, status]);

  const toggle = useCallback(
    (id: string) => {
      onChange(
        selectedIds.includes(id)
          ? selectedIds.filter((s) => s !== id)
          : [...selectedIds, id],
      );
    },
    [selectedIds, onChange],
  );

  const hasMore = items.length < total;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">
              Escolher artigos
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Os rascunhos podem entrar: publicar o pacote publica-os e
              torna-os exclusivos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-[13px] font-semibold text-slate-500 hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar por título…"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-[13px] outline-none focus:border-slate-500"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | ArticleStatus)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-[13px] outline-none focus:border-slate-500"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-slate-500">
            {selectedIds.length} escolhido(s)
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {error && (
            <p className="rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">
              Erro a carregar artigos: {error}
            </p>
          )}
          {!error && items.length === 0 && !loading && (
            <p className="py-8 text-center text-[13px] text-slate-500">
              Nenhum artigo encontrado.
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {items.map((a) => {
              const checked = selectedIds.includes(a.id);
              const thumb = a.coverImageUrl
                ? adminMediaUrl(imageVariant(a.coverImageUrl, "small"))
                : null;
              return (
                <li key={a.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${
                      checked
                        ? "border-slate-900 bg-slate-50"
                        : "border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(a.id)}
                      className="h-4 w-4 shrink-0"
                    />
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="h-10 w-14 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="h-10 w-14 shrink-0 rounded bg-slate-100" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-slate-900">
                        {a.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        {statusChip(a.status)}
                        {a.exclusive && (
                          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200">
                            Exclusivo
                          </span>
                        )}
                        {a.category?.name && (
                          <span className="text-[11px] text-slate-500">
                            {a.category.name}
                          </span>
                        )}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {loading && (
            <p className="py-3 text-center text-[12px] text-slate-500">
              A carregar…
            </p>
          )}
          {hasMore && !loading && (
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              className="mt-2 w-full rounded-md border border-slate-300 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Carregar mais ({items.length} de {total})
            </button>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-slate-800"
          >
            Concluído
          </button>
        </div>
      </div>
    </div>
  );
}
