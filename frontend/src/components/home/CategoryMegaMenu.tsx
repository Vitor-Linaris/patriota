import Link from "next/link";
import type { CategoryDef } from "@/lib/categories";
import { CategoryPanel } from "./CategoryPanel";

/**
 * One top-level nav item in the masthead. With subsections it opens a
 * panel on hover; with none it is a plain link.
 *
 * No JavaScript: the panel is revealed by `group-hover` and
 * `group-focus-within`, which keeps <SiteHeader> a server component and
 * means the menu works before hydration and with the keyboard (tabbing
 * into the section link opens it, tabbing out closes it) without an
 * Escape handler to write or a state machine to get wrong.
 *
 * There is no caret on the label. The panel appears on hover, and a
 * marker on some items but not others made the bar look uneven for
 * information the reader gets a moment later anyway.
 *
 * Two levels, hard stop. Level-3 nodes appear as a counted line under
 * their parent rather than a nested flyout: a reader does not navigate
 * TO a bairro, they arrive at one. Putting destinations in a navigation
 * menu is what makes a four-level dropdown feel like a dead archive —
 * the deeper levels are reached inside the section page.
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
        className="text-slate-700 transition hover:text-patriota-medium group-focus-within:text-patriota-medium"
      >
        {category.label}
      </Link>

      {/* pt-3 rather than a margin: the padding is part of the hover
          target, so the pointer can cross the gap into the panel without
          it closing underneath them. */}
      <div className="invisible absolute left-1/2 top-full z-50 w-max max-w-[min(46rem,90vw)] -translate-x-1/2 pt-3 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <CategoryPanel category={category} />
      </div>
    </div>
  );
}
