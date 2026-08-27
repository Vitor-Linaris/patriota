"use client";

import { useEffect, useState } from "react";
import { Container } from "../Container";
import { FEATURES } from "@/lib/features";
import { NewsletterModal } from "./NewsletterModal";
import { SearchModal } from "./SearchModal";

/**
 * Today, in Lisbon.
 *
 * The timeZone is pinned on purpose. Without it, Intl uses whatever
 * timezone the RUNTIME is in — and the two runtimes disagree: the
 * container runs UTC while the reader browser runs their own local time.
 * Server and client then render different dates and hydration fails.
 *
 * Pinning is also editorially right: this is the masthead of a
 * Portuguese newspaper, so the date is Portugal's, not the reader's.
 * Matches settings.geral.timezone, which already defaults to
 * Europe/Lisbon.
 */
function formatToday(): string {
  const long = new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Lisbon",
  }).format(new Date());
  return long.charAt(0).toUpperCase() + long.slice(1);
}

export function TopBar() {
  const [newsletterOpen, setNewsletterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Global ⌘K / Ctrl+K opens the search modal from anywhere on the
  // page. We register at the TopBar level because it lives on every
  // public route — single registration, no duplication.
  //
  // We also listen for custom DOM events so other components (e.g.
  // the mobile <MobileNav> drawer) can pop these modals open without
  // having to do prop drilling or share React state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    const openSearch = () => setSearchOpen(true);
    const openNewsletter = () => setNewsletterOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("patriota:search", openSearch);
    window.addEventListener("patriota:newsletter", openNewsletter);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("patriota:search", openSearch);
      window.removeEventListener("patriota:newsletter", openNewsletter);
    };
  }, []);

  return (
    <>
      <div className="bg-patriota-medium text-[#d0d5dd] text-[12px]">
        <Container className="flex h-9 items-center justify-between">
          <div className="flex items-center gap-4">
            {/*
              suppressHydrationWarning covers the one case pinning cannot:
              a render and its hydration landing either side of midnight
              in Lisbon. A sub-second window once a day, where the client
              value is the correct one to keep.
            */}
            <span suppressHydrationWarning>{formatToday()}</span>
            <span aria-hidden className="h-3 w-px bg-white/20" />
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-patriota-accent animate-pulse" />
              <span className="text-[12px] font-medium uppercase tracking-wide text-patriota-accent">
                Em atualização
              </span>
            </span>
          </div>
          <nav className="hidden items-center gap-4 sm:flex">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
            >
              <span aria-hidden>⌕</span> Pesquisar
              <kbd className="hidden rounded border border-white/15 bg-white/5 px-1 py-0.5 text-[10px] font-medium text-white/60 md:inline-block">
                ⌘K
              </kbd>
            </button>
            <span aria-hidden className="h-3 w-px bg-white/20" />
            <button
              type="button"
              className="transition-colors hover:text-white"
              onClick={() => setNewsletterOpen(true)}
            >
              Newsletter
            </button>
            {FEATURES.publicAuth && FEATURES.readerArea && (
              <>
                <span aria-hidden className="h-3 w-px bg-white/20" />
                {/* Reader accounts, NOT /admin/login — the backoffice is a
                    separate account system and stays URL-only. */}
                <a className="hover:text-white" href="/conta/entrar">
                  Iniciar sessão
                </a>
                <a
                  className="rounded bg-patriota-accent px-2.5 py-0.5 text-[12px] font-medium text-patriota-medium hover:brightness-105"
                  href="/conta/registar"
                >
                  Criar conta
                </a>
              </>
            )}
          </nav>
        </Container>
      </div>

      <NewsletterModal
        open={newsletterOpen}
        onClose={() => setNewsletterOpen(false)}
      />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
