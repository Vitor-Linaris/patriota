import Link from "next/link";
import type { CategoryDef } from "@/lib/categories";

/** Grandchildren are counted, not listed — see the note in CategoryMegaMenu. */
const COLUMN_CHILD_LIMIT = 6;

/**
 * The white card that drops out of a nav item: "ver tudo", then the
 * subsections in columns.
 *
 * Shared by both bars so a section behaves the same whether the admin
 * ordered it into the top six or it spilled into the strip below —
 * having subsections is a property of the category, not of which bar it
 * landed in.
 */
export function CategoryPanel({ category }: { category: CategoryDef }) {
  const href = `/categoria/${category.slug}`;
  return (
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
  );
}
