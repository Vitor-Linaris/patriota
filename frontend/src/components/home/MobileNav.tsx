"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { CategoryDef } from "@/lib/categories";

/**
 * Hamburger menu for tablet + mobile. Replaces the inline category
 * row in <SiteHeader> on screens narrower than `lg`. Slides in from
 * the right with a backdrop; Esc / backdrop click close it.
 *
 * Receives the full category catalogue as props (already split into
 * primary + secondary by the parent server component) so it stays
 * fully static after hydration — no client-side fetching.
 *
 * Includes shortcuts to the search and newsletter modals at the
 * bottom, so the mobile reader has a single entry point for "search
 * + browse + subscribe" without having to remember where each lives
 * on a tiny viewport.
 */
/**
 * A top-level section in the drawer. If it has subsections, the row
 * splits: the label navigates, the chevron expands.
 *
 * Exactly ONE level deep, and deliberately so. Level 3 and 4 are reached
 * from inside the section page, not here — a four-level accordion on a
 * phone is a scroll trap where the reader loses track of what they
 * opened.
 */
function SectionRow({
  category,
  expanded,
  onToggle,
  onNavigate,
}: {
  category: CategoryDef;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const href = `/categoria/${category.slug}`;
  const count = category.articleCountTotal || category.articleCount;

  if (category.children.length === 0) {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold text-slate-800 transition-colors hover:bg-patriota-pure hover:text-patriota-dark"
      >
        <span>{category.label}</span>
        {count > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
            {count}
          </span>
        )}
      </Link>
    );
  }

  return (
    <>
      <div className="flex items-center rounded-lg transition-colors hover:bg-patriota-pure">
        <Link
          href={href}
          onClick={onNavigate}
          className="flex-1 px-3 py-2.5 text-[15px] font-semibold text-slate-800 hover:text-patriota-dark"
        >
          {category.label}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `Fechar subsecções de ${category.label}`
              : `Ver subsecções de ${category.label}`
          }
          className="flex h-10 w-10 items-center justify-center text-slate-400 hover:text-patriota-dark"
        >
          <span
            aria-hidden
            className={`text-[10px] transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            ▼
          </span>
        </button>
      </div>

      {expanded && (
        <ul className="mb-1 ml-3 flex flex-col gap-0.5 border-l border-slate-100 pl-3">
          <li>
            <Link
              href={href}
              onClick={onNavigate}
              className="block rounded-lg px-3 py-2 text-[13px] font-bold text-patriota-medium hover:bg-patriota-pure"
            >
              Ver tudo em {category.label} →
            </Link>
          </li>
          {category.children.map((child) => (
            <li key={child.slug}>
              <Link
                href={`/categoria/${child.slug}`}
                onClick={onNavigate}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[14px] text-slate-600 transition-colors hover:bg-patriota-pure hover:text-patriota-dark"
              >
                <span>{child.label}</span>
                {child.articleCountTotal > 0 && (
                  <span className="text-[11px] text-slate-400">
                    {child.articleCountTotal}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function MobileNav({
  primary,
  secondary,
}: {
  primary: CategoryDef[];
  secondary: CategoryDef[];
}) {
  const [open, setOpen] = useState(false);
  // One section open at a time. A tap on another closes the first —
  // a phone screen has no room for two expanded lists, and letting
  // several stack turns the drawer into a scroll trap.
  const [expanded, setExpanded] = useState<string | null>(null);

  // Esc to close, body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const all = [...primary, ...secondary];

  return (
    <>
      {/* Hamburger button — only visible below lg. Stays as 3 bars
          always: when the drawer opens it slides over this button and
          the drawer's own ✕ in its header handles closing. Avoids the
          "double X" confusion of having both the rotated hamburger and
          a close button visible at once. */}
      <button
        type="button"
        aria-label="Abrir menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 lg:hidden"
      >
        <span className="relative block h-4 w-6">
          <span className="absolute left-0 top-0 block h-0.5 w-6 rounded-full bg-current" />
          <span className="absolute left-0 top-1/2 block h-0.5 w-6 -translate-y-1/2 rounded-full bg-current" />
          <span className="absolute bottom-0 left-0 block h-0.5 w-6 rounded-full bg-current" />
        </span>
      </button>

      {/* Backdrop */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        className={`fixed inset-y-0 right-0 z-[105] flex w-[85%] max-w-sm flex-col overflow-y-auto bg-white shadow-2xl transition-transform duration-300 ease-out lg:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            aria-label="O Patriota"
            className="inline-flex"
          >
            <Image
              src="/brand/Logo-header.svg"
              alt="O Patriota"
              width={104}
              height={42}
              className="h-auto"
            />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Primary categories — featured prominently */}
        {primary.length > 0 && (
          <nav className="px-2 py-4" aria-label="Secções principais">
            <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Secções
            </p>
            <ul className="flex flex-col gap-0.5">
              {primary.map((c) => (
                <li key={c.slug}>
                  <SectionRow
                    category={c}
                    expanded={expanded === c.slug}
                    onToggle={() =>
                      setExpanded((prev) => (prev === c.slug ? null : c.slug))
                    }
                    onNavigate={() => setOpen(false)}
                  />
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Secondary categories — same data the desktop SecondaryNav
            shows. On mobile we include them here so the reader has a
            single navigation surface; the visible SecondaryNav strip
            below the header is fine for casual swiping but small. */}
        {secondary.length > 0 && (
          <nav
            className="border-t border-slate-100 px-2 py-4"
            aria-label="Outras secções"
          >
            <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Mais rubricas
            </p>
            <ul className="flex flex-col gap-0.5">
              {secondary.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/categoria/${c.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[14px] text-slate-600 transition-colors hover:bg-patriota-pure hover:text-patriota-dark"
                  >
                    <span>{c.label}</span>
                    {c.articleCountTotal > 0 && (
                      <span className="text-[11px] text-slate-400">
                        {c.articleCountTotal}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {all.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-slate-400">
            Sem rubricas configuradas.
          </p>
        )}

        {/* Quick actions — search + newsletter — mirror what's in
            the TopBar but visible here for mobile users who don't
            see the top strip clearly. */}
        <div className="mt-auto border-t border-slate-100 px-5 py-5">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Atalhos
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                // TopBar listens to this event and opens the
                // SearchModal — keeps the modal state in one place
                // without prop drilling through the layout.
                window.dispatchEvent(new CustomEvent("patriota:search"));
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] font-bold text-slate-700 transition-colors hover:border-patriota-medium hover:text-patriota-medium"
            >
              <span aria-hidden>⌕</span> Pesquisar
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new CustomEvent("patriota:newsletter"));
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-patriota-dark px-3 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-patriota-medium"
            >
              Newsletter
            </button>
          </div>
          <p className="mt-4 text-center text-[11px] text-slate-400">
            © 2026 O Patriota Notícias
          </p>
        </div>
      </aside>
    </>
  );
}
