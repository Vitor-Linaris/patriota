"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ArticleHit {
  id: string;
  slug: string;
  title: string;
  category: { name: string; slug: string };
}

interface CategoryTopic {
  slug: string;
  label: string;
  articleCount: number;
}

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

const RECENT_KEY = "patriota:recent-searches";
const MAX_RECENT = 6;

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecent(list: string[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

function pushRecent(term: string): string[] {
  const clean = term.trim();
  if (!clean) return loadRecent();
  const current = loadRecent().filter(
    (s) => s.toLowerCase() !== clean.toLowerCase(),
  );
  const next = [clean, ...current].slice(0, MAX_RECENT);
  saveRecent(next);
  return next;
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8585";
}

/**
 * Full-screen-on-mobile, sheet-like-on-desktop search overlay. Two
 * modes by content:
 *   • Empty query  → Topics (categories with counts) + Recent searches
 *                    (localStorage; deduped, capped at 6).
 *   • Typing       → Inline article hits, debounced 250 ms. Pressing
 *                    Enter or "Ver todos" jumps to /pesquisa?q=…
 *
 * Keyboard:
 *   • Esc          → close
 *   • ⌘/Ctrl+K     → open from anywhere (registered globally on
 *                    a CustomEvent so TopBar can trigger it too)
 *   • Arrow keys / Enter on the input submits the search.
 */
export function SearchModal({ open, onClose }: SearchModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ArticleHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [topics, setTopics] = useState<CategoryTopic[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  // Initial load: focus the input, hydrate topics + recent, lock scroll.
  useEffect(() => {
    if (!open) return;
    setQ("");
    setResults([]);
    setRecent(loadRecent());
    inputRef.current?.focus();
    document.body.style.overflow = "hidden";
    // Deliberately /public/categories (top-level only) and not the tree:
    // a browse-by-topic shortcut with every subtópico in it would be a
    // filter with hundreds of options.
    void fetch(`${apiBase()}/public/categories`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (!Array.isArray(data)) return;
        setTopics(
          (
            data as Array<{
              slug?: string;
              name?: string;
              articleCount?: number;
              articleCountTotal?: number;
            }>
          )
            .filter((c) => c.slug && c.name)
            .map((c) => ({
              slug: c.slug as string,
              label: c.name as string,
              // The rolled-up count: a section whose articles all live in
              // its subsections is not an empty section to a reader.
              articleCount: c.articleCountTotal ?? c.articleCount ?? 0,
            }))
            .sort((a, b) => b.articleCount - a.articleCount)
            .slice(0, 8),
        );
      })
      .catch(() => {
        /* leave topics empty on network error */
      });
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Debounced article search.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: term, pageSize: "6" });
        const res = await fetch(
          `${apiBase()}/public/articles?${params.toString()}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          setResults([]);
          return;
        }
        const body = (await res.json()) as { items?: ArticleHit[] };
        setResults(body.items ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [q, open]);

  // Esc to close + global ⌘K trigger live in the parent (TopBar)
  // because we want them to work even when the modal isn't open.
  // Here we just handle Esc while we ARE open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const submitSearch = useCallback(
    (term: string) => {
      const clean = term.trim();
      if (!clean) return;
      setRecent(pushRecent(clean));
      onClose();
      router.push(`/pesquisa?q=${encodeURIComponent(clean)}`);
    },
    [onClose, router],
  );

  const clearRecent = () => {
    saveRecent([]);
    setRecent([]);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/60 px-4 pt-[10vh] backdrop-blur-sm sm:pt-[15vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pesquisar artigos"
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch(q);
          }}
          className="flex items-center gap-3 border-b border-slate-100 px-5 py-4"
        >
          <span className="text-xl text-slate-400" aria-hidden>
            ⌕
          </span>
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="O que procura?"
            className="flex-1 bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
              aria-label="Limpar"
              className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              ✕
            </button>
          )}
          <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 sm:inline-block">
            Esc
          </kbd>
        </form>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim().length >= 2 ? (
            <div className="px-2 py-3">
              {searching && results.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-slate-400">
                  A procurar…
                </p>
              )}
              {!searching && results.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-slate-400">
                  Nenhum artigo encontrado para “{q.trim()}”.
                </p>
              )}
              {results.length > 0 && (
                <>
                  <ul className="space-y-0.5">
                    {results.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setRecent(pushRecent(q));
                            onClose();
                            router.push(`/artigo/${r.slug}`);
                          }}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                        >
                          <span
                            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-patriota-accent"
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-slate-900">
                              {r.title}
                            </p>
                            <p className="text-[11px] uppercase tracking-wider text-slate-400">
                              {r.category.name}
                            </p>
                          </div>
                          <span
                            aria-hidden
                            className="text-slate-300 transition-colors group-hover:text-slate-500"
                          >
                            →
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => submitSearch(q)}
                    className="mt-2 block w-full rounded-lg border border-slate-100 px-3 py-2.5 text-center text-[13px] font-bold text-patriota-medium transition-colors hover:bg-slate-50"
                  >
                    Ver todos os resultados para “{q.trim()}” →
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="px-5 py-4">
              {recent.length > 0 && (
                <section className="mb-6">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Pesquisas recentes
                    </h3>
                    <button
                      type="button"
                      onClick={clearRecent}
                      className="text-[11px] text-slate-400 transition-colors hover:text-rose-600"
                    >
                      Limpar
                    </button>
                  </div>
                  <ul className="flex flex-wrap gap-2">
                    {recent.map((term) => (
                      <li key={term}>
                        <button
                          type="button"
                          onClick={() => submitSearch(term)}
                          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] text-slate-700 transition-colors hover:border-patriota-medium hover:bg-white"
                        >
                          <span className="text-slate-400" aria-hidden>
                            ↻
                          </span>
                          {term}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {topics.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Tópicos sugeridos
                  </h3>
                  <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {topics.map((t) => (
                      <li key={t.slug}>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            router.push(`/categoria/${t.slug}`);
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[14px] transition-colors hover:bg-slate-50"
                        >
                          <span className="font-semibold text-slate-800">
                            {t.label}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                            {t.articleCount}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {recent.length === 0 && topics.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">
                  Escreva pelo menos 2 caracteres para começar.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] text-slate-500">
          <span className="hidden sm:inline">
            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-semibold">
              Enter
            </kbd>{" "}
            para procurar
          </span>
          <span>O Patriota Notícias</span>
        </div>
      </div>
    </div>
  );
}
