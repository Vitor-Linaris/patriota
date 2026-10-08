import Link from "next/link";

export type SortKey = "publishedAt" | "views" | "comments";

const FILTERS: { key: SortKey; label: string }[] = [
  { key: "publishedAt", label: "Mais Recentes" },
  { key: "views", label: "Mais Lidas" },
  { key: "comments", label: "Mais Comentadas" },
];

/** `?sort=` as a SortKey; anything unknown means "most recent". */
export function parseSort(raw: string | undefined): SortKey {
  return FILTERS.some((f) => f.key === raw) ? (raw as SortKey) : "publishedAt";
}

/** The query string for a sort, empty for the default — so the plain URL stays canonical. */
export function sortQuery(sort: SortKey): string {
  return sort === "publishedAt" ? "" : `sort=${sort}`;
}

/**
 * Mais Recentes / Mais Lidas / Mais Comentadas over a list of articles.
 * Shared by a category's front page and its full listing, which differ
 * only in where each tab points.
 */
export function SortTabs({
  active,
  hrefFor,
}: {
  active: SortKey;
  hrefFor: (key: SortKey) => string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Ordenar artigos"
      className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-[13px]"
    >
      {FILTERS.map((f) => {
        const isActive = f.key === active;
        return (
          <Link
            key={f.key}
            href={hrefFor(f.key)}
            scroll={false}
            role="tab"
            aria-selected={isActive}
            className={
              "rounded-md px-3 py-1.5 font-semibold transition " +
              (isActive
                ? "bg-patriota-dark text-white"
                : "text-slate-600 hover:text-slate-900")
            }
          >
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}
