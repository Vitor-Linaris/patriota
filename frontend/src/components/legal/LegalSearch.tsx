"use client";

import { useMemo, useState } from "react";

export interface LegalSearchItem {
  /** Section label without the leading "1. " — matches the TOC label. */
  label: string;
  anchor: string;
  /** Heading + every paragraph/list item, flattened, for matching. */
  text: string;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * "Search this page" for the legal pages — Termos, Privacidade, Cookies,
 * ERC. These are long, numbered documents; a reader looking for one
 * clause (do we cover reembolsos? menores? cookies analíticos?)
 * shouldn't have to read the whole thing to find out.
 *
 * Deliberately not a filter that hides non-matching sections: the
 * article below is server-rendered for SEO and a plain scroll must
 * keep working with JS off. This is a client-side overlay that lists
 * which sections match and jumps to them — additive, never destructive.
 */
export function LegalSearch({ items }: { items: LegalSearchItem[] }) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return items.filter(
      (item) => normalize(item.label).includes(q) || normalize(item.text).includes(q),
    );
  }, [items, query]);

  return (
    <div className="relative mb-8">
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 3.51 9.74l3.62 3.63a.75.75 0 1 0 1.06-1.06l-3.63-3.62A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Procurar nesta página — ex. reembolso, menores, cookies…"
          aria-label="Procurar nesta página"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-[14px] text-slate-800 placeholder:text-slate-400 focus:border-patriota-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-patriota-medium/20"
        />
      </div>

      {query.trim() !== "" && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {matches.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-slate-400">
              Sem resultados para &quot;{query}&quot;.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {matches.map((item) => (
                <li key={item.anchor}>
                  <a
                    href={`#${item.anchor}`}
                    onClick={() => setQuery("")}
                    className="block px-4 py-2.5 text-[14px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-patriota-medium"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
