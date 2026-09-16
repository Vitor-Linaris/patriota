"use client";

import { useCallback, useEffect, useState } from "react";
import { imageVariant } from "@/lib/images";
import { adminMediaUrl } from "@/lib/media-preview";
import {
  indentOption,
  type CategoryOption,
} from "@/lib/category-options";
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
  categories,
  selectedIds,
  onChange,
  onClose,
}: {
  /** The whole forest, flattened, parent before children. */
  categories: readonly CategoryOption[];
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
  /**
   * The category SLUG, which is what /admin/articles filters on.
   *
   * Narrow by section, not by remembering a headline: a pacote is
   * usually every piece a newsroom wrote about one subject, and finding
   * them by typing each title is the job this filter removes. Filtering
   * is exact — picking "Portugal" means Portugal and not the Funchal
   * underneath it — which is the CMS rule the API already applies, and
   * the opposite of what the public site does.
   */
  const [category, setCategory] = useState("");
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
  }, [debounced, status, category]);

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
    if (category) params.set("category", category);

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
  }, [page, debounced, status, category]);

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

  // Esc closes it, the same as clicking the dark area or "Fechar".
  // Nothing here is unsaved: ticking a row calls onChange immediately,
  // so there is no draft state to warn about.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasMore = items.length < total;

  return (
    <div
      // Marks this as the top dialog: the pacote editor underneath
      // checks for it before acting on Esc.
      data-modal-top
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
          {/*
            Hidden entirely when the catalogue came back empty — an
            editor whose role cannot read it gets no control rather than
            a select with one dead option in it.
          */}
          {categories.length > 0 && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filtrar por categoria"
              className="max-w-[180px] rounded-md border border-slate-300 px-2 py-1.5 text-[13px] outline-none focus:border-slate-500"
            >
              <option value="">Todas as categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {indentOption(c.name, c.depth)}
                </option>
              ))}
            </select>
          )}
          {(status || category || debounced) && (
            <button
              type="button"
              onClick={() => {
                setStatus("");
                setCategory("");
                setSearch("");
              }}
              className="rounded-md px-2 py-1.5 text-[12px] font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
            >
              Limpar
            </button>
          )}
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
