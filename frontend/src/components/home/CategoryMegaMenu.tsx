import Link from "next/link";
import type { CategoryDef } from "@/lib/categories";

/** Grandchildren are counted, not listed — see the note below. */
const COLUMN_CHILD_LIMIT = 6;

/**
 * One top-level nav item. With children it opens a two-level panel; with
 * none it is a plain link.
 *
 * No JavaScript: the panel is revealed by `group-hover` and
 * `group-focus-within`, which keeps <SiteHeader> a server component and
 * means the menu works before hydration and with the keyboard (tabbing
 * into the section link opens it, tabbing out closes it) without an
 * Escape handler to write or a state machine to get wrong.
 *
 * Two levels, hard stop. Level-3 nodes appear as a "+N mais" count on
 * their parent rather than a nested flyout: a reader does not navigate
 * TO a bairro, they arrive at one. Putting destinations in a navigation
 * menu is exactly what makes a four-level dropdown feel like a dead
 * archive. The deeper levels are reached inside the section page.
 */
export function CategoryMegaMenu({ category }: { category: CategoryDef }) {
  const href = `/categoria/${category.slug}`;

  if (category.children.length === 0) {
    return (
      <Link
        href={href}
        className="text-slate-700 transition hover:text-patriota-medium"
      >
        {category.label}
      </Link>
    );
  }

  return (
    <div className="group relative">
      <Link
        href={href}
        className="flex items-center gap-1 text-slate-700 transition hover:text-patriota-medium group-focus-within:text-patriota-medium"
      >
        {category.label}
        <span aria-hidden className="text-[9px] text-slate-400">
          ▼
        </span>
      </Link>

      <div
        className="invisible absolute left-1/2 top-full z-50 w-max max-w-[min(46rem,90vw)] -translate-x-1/2 pt-3 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
          <Link
            href={href}
            className="mb-3 inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-patriota-medium hover:underline"
          >
            Ver tudo em {category.label}
            <span aria-hidden>→</span>
          </Link>

          <ul className="grid grid-cols-2 gap-x-8 gap-y-1 md:grid-cols-3">
            {category.children.map((child) => (
              <li key={child.slug}>
                <Link
                  href={`/categoria/${child.slug}`}
                  className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-[14px] text-slate-700 transition hover:bg-patriota-pure hover:text-patriota-dark"
                >
                  <span className="font-medium">{child.label}</span>
                  {child.articleCountTotal > 0 && (
                    <span className="text-[11px] text-slate-400">
                      {child.articleCountTotal}
                    </span>
                  )}
                </Link>
                {child.children.length > 0 && (
                  <p className="px-2 pb-1 text-[11px] text-slate-400">
                    {child.children
                      .slice(0, COLUMN_CHILD_LIMIT)
                      .map((g) => g.label)
                      .join(" · ")}
                    {child.children.length > COLUMN_CHILD_LIMIT &&
                      ` + ${child.children.length - COLUMN_CHILD_LIMIT} mais`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
