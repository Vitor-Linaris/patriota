import Link from "next/link";

interface PaginationProps {
  /** 1-based current page. */
  current: number;
  /** Total number of pages (NOT total items). */
  totalPages: number;
  /**
   * URL builder. Receives a 1-based page number and returns the href
   * to navigate to. Lets callers preserve other query params (filters,
   * search) however they need.
   */
  hrefForPage: (page: number) => string;
  className?: string;
}

/**
 * Public-style pagination — left/right arrows + numbered buttons.
 * Truncates with an ellipsis when there are more than 7 pages so the
 * bar never gets unmanageably wide.
 *
 * Server-renders to plain `<Link>` so it works on public pages
 * (deep-linkable) and on admin client pages alike.
 */
export function Pagination({
  current,
  totalPages,
  hrefForPage,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;
  const pages = buildPageList(current, totalPages);
  const prev = Math.max(1, current - 1);
  const next = Math.min(totalPages, current + 1);

  return (
    <nav
      aria-label="Paginação"
      className={
        className ?? "flex items-center justify-center gap-2 py-8"
      }
    >
      <PageLink
        href={hrefForPage(prev)}
        disabled={current === 1}
        ariaLabel="Página anterior"
      >
        ←
      </PageLink>
      {pages.map((p, i) =>
        p === "…" ? (
          <span
            key={`gap-${i}`}
            aria-hidden
            className="px-1 text-[13px] text-slate-400"
          >
            …
          </span>
        ) : (
          <PageLink
            key={p}
            href={hrefForPage(p)}
            active={p === current}
          >
            {p}
          </PageLink>
        ),
      )}
      <PageLink
        href={hrefForPage(next)}
        disabled={current === totalPages}
        ariaLabel="Próxima página"
      >
        →
      </PageLink>
    </nav>
  );
}

/**
 * Returns a compact page list for the bar. Example for current=6,
 * total=12: [1, "…", 5, 6, 7, "…", 12].
 */
function buildPageList(
  current: number,
  total: number,
): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

function PageLink({
  href,
  children,
  active = false,
  disabled = false,
  ariaLabel,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const className =
    "flex h-9 min-w-[36px] items-center justify-center rounded-md border px-2 text-[13px] font-semibold transition " +
    (active
      ? "border-patriota-dark bg-patriota-dark text-white"
      : disabled
        ? "pointer-events-none border-slate-100 bg-slate-50 text-slate-300"
        : "border-slate-200 bg-white text-slate-700 hover:border-slate-400");

  if (disabled) {
    return (
      <span aria-disabled aria-label={ariaLabel} className={className}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {children}
    </Link>
  );
}
