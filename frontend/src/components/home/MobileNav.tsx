"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { FiChevronRight, FiLogOut, FiUser } from "react-icons/fi";
import { FEATURES } from "@/lib/features";
import type { CategoryDef } from "@/lib/categories";

interface DrawerReader {
  name: string;
}

/**
 * Sign-in / account entry point, for the drawer.
 *
 * The desktop <ReaderNav> in <TopBar> shows only from `sm:` up — the
 * drawer is what a phone actually sees, and it never carried this at
 * all. Search and Newsletter were already duplicated down here for
 * exactly that reason ("Atalhos", below); reader identity was the one
 * thing that fell through. Same data source (`/api/conta/me`), same
 * "render nothing until resolved" rule so a signed-in reader never
 * flashes "Iniciar sessão" first — but styled for a light panel with
 * full-width rows, not <ReaderNav>'s dark inline-bar chrome.
 */
function DrawerAccount({ onNavigate }: { onNavigate: () => void }) {
  const [reader, setReader] = useState<DrawerReader | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/conta/me");
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { reader: DrawerReader | null };
          setReader(data.reader);
        }
      } catch {
        // The drawer must open even if this fails; treated as logged out.
      } finally {
        if (!cancelled) setResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!resolved) {
    // Holds the row's height so the sections below do not jump once
    // the answer lands.
    return <div className="h-[60px] px-2 py-4" aria-hidden />;
  }

  if (!reader) {
    return (
      <div className="flex gap-2 px-3 py-4">
        <Link
          href="/conta/entrar"
          onClick={onNavigate}
          className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] font-bold text-slate-700 transition-colors hover:border-patriota-medium hover:text-patriota-medium"
        >
          Iniciar sessão
        </Link>
        <Link
          href="/conta/registar"
          onClick={onNavigate}
          className="flex flex-1 items-center justify-center rounded-xl bg-patriota-dark px-3 py-2.5 text-[14px] font-bold text-white transition-colors hover:bg-patriota-medium"
        >
          Criar conta
        </Link>
      </div>
    );
  }

  const initials = reader.name.slice(0, 2).toUpperCase();

  return (
    <div className="px-2 py-3">
      {/* group + hover:text-white on the row: patriota-pure is a
          saturated mid-blue, and the dark/muted text this row uses
          normally measures under 3:1 against it on hover — well below
          the 4.5:1 WCAG floor. White clears 5:1; the sub-line and
          chevron pick it up too via group-hover so nothing is left
          half-legible. */}
      <Link
        href="/conta"
        onClick={onNavigate}
        className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-patriota-pure hover:text-white"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-patriota-dark text-[12px] font-bold text-white"
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-slate-800 group-hover:text-white">
            {reader.name}
          </span>
          <span className="flex items-center gap-1 text-[12px] text-slate-400 group-hover:text-white/75">
            <FiUser size={11} aria-hidden />A minha conta
          </span>
        </span>
        <FiChevronRight
          size={16}
          className="shrink-0 text-slate-300 group-hover:text-white/75"
          aria-hidden
        />
      </Link>
      {/*
        POST, not a link: a GET logout is fired by link prefetch and by
        corporate mail scanners, silently ending sessions. Same as the
        desktop ReaderNav.
      */}
      <form action="/conta/sair" method="post">
        <button
          type="submit"
          onClick={onNavigate}
          className="mt-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] text-slate-500 hover:bg-patriota-pure hover:text-white"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center">
            <FiLogOut size={15} aria-hidden />
          </span>
          Terminar sessão
        </button>
      </form>
    </div>
  );
}

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
 * A section in the drawer, at any depth. If it has subsections, the row
 * splits: the label navigates, the chevron expands to show them —
 * recursively, so a subcategory's own children get exactly the same
 * row, one level further indented.
 *
 * Used to stop at depth 1 on purpose, with a comment calling a deeper
 * accordion "a scroll trap". It still can be, which is why:
 *   • each row's expanded state is its OWN, not lifted to a shared
 *     "one thing open at a time" — forcing that across four levels
 *     would close a grandparent's other branches the moment a reader
 *     opens a great-grandchild, which is a worse trap than a long list;
 *   • indentation and type size both shrink with depth, so the reader
 *     can tell how deep they are without counting chevrons;
 *   • it only ever grows on a tap — nothing expands two levels at once.
 */
function SectionRow({
  category,
  depth = 0,
  onNavigate,
}: {
  category: CategoryDef;
  depth?: number;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const href = `/categoria/${category.slug}`;
  const count = category.articleCountTotal || category.articleCount;
  // Clamped: depth 3 (subtópico) and beyond share the deepest step
  // rather than marching off the edge of a phone screen.
  const indent = Math.min(depth, 3) * 14;
  const labelSize = depth === 0 ? "text-[15px]" : "text-[14px]";
  const labelWeight = depth === 0 ? "font-semibold" : "font-medium";

  if (category.children.length === 0) {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        style={{ paddingLeft: 12 + indent }}
        // hover:text-white, not the dark navy used elsewhere: dark
        // text on patriota-pure's saturated mid-blue measures under
        // 3:1 contrast, well below the 4.5:1 WCAG floor.
        className={`flex items-center justify-between gap-3 rounded-lg py-2.5 pr-3 ${labelSize} ${labelWeight} text-slate-800 transition-colors hover:bg-patriota-pure hover:text-white`}
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
      {/* group + group-hover:text-white below, not hover:text-patriota-dark
          on each child: same 3:1-against-patriota-pure contrast problem
          as the leaf row above, and grouping means hovering the button
          (not just the link) also turns the label white — the whole
          row reads as one hover target either way. */}
      <div className="group flex items-center rounded-lg transition-colors hover:bg-patriota-pure">
        <Link
          href={href}
          onClick={onNavigate}
          style={{ paddingLeft: 12 + indent }}
          className={`flex-1 py-2.5 pr-3 ${labelSize} ${labelWeight} text-slate-800 group-hover:text-white`}
        >
          {category.label}
        </Link>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `Fechar subsecções de ${category.label}`
              : `Ver subsecções de ${category.label}`
          }
          className="flex h-10 w-10 shrink-0 items-center justify-center text-slate-400 group-hover:text-white"
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
        <ul className="mb-1 flex flex-col gap-0.5 border-l border-slate-100">
          <li>
            <Link
              href={href}
              onClick={onNavigate}
              style={{ paddingLeft: 24 + indent }}
              // hover:text-white: text-patriota-medium against
              // patriota-pure is two similar-toned blues, under 2:1
              // contrast — nearly invisible on hover, not just dim.
              className="block rounded-lg py-2 pr-3 text-[13px] font-bold text-patriota-medium hover:bg-patriota-pure hover:text-white"
            >
              Ver tudo em {category.label} →
            </Link>
          </li>
          {category.children.map((child) => (
            <li key={child.slug}>
              <SectionRow
                category={child}
                depth={depth + 1}
                onNavigate={onNavigate}
              />
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

        {/* Sign in / account. First thing after the header — on a
            phone this drawer IS the only navigation surface, so it is
            also the only place a reader can reach their account at
            all; it should not be buried under every category list. */}
        {FEATURES.publicAuth && FEATURES.readerArea && (
          <div className="border-b border-slate-100">
            <DrawerAccount onNavigate={() => setOpen(false)} />
          </div>
        )}

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
                  <SectionRow category={c} onNavigate={() => setOpen(false)} />
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
