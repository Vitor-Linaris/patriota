"use client";

import { useEffect, useState } from "react";
import { FiChevronDown, FiLogOut, FiUser } from "react-icons/fi";

interface Reader {
  name: string;
}

/**
 * Top-bar identity: the sign-in links when nobody is logged in, the
 * reader's name when somebody is.
 *
 * Resolved on the CLIENT. The homepage and category pages are cached and
 * prerendered, so a name rendered into their HTML on the server would be
 * handed to every other visitor. Only this island varies per reader.
 *
 * While the answer is in flight it renders nothing rather than flashing
 * "Iniciar sessão" at a reader who is already signed in.
 */
export function ReaderNav() {
  const [reader, setReader] = useState<Reader | null>(null);
  const [resolved, setResolved] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/conta/me");
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { reader: Reader | null };
          setReader(data.reader);
        }
      } catch {
        // The site must render even if this fails; treated as logged out.
      } finally {
        if (!cancelled) setResolved(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Close the menu on any outside click.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  if (!resolved) {
    // Hold the space so the bar does not jump when the answer lands.
    return <span className="inline-block h-4 w-[128px]" aria-hidden />;
  }

  if (!reader) {
    return (
      <>
        <a className="transition-colors hover:text-white" href="/conta/entrar">
          Iniciar sessão
        </a>
        <a
          className="rounded bg-patriota-accent px-2.5 py-0.5 text-[12px] font-medium text-patriota-medium transition hover:brightness-105"
          href="/conta/registar"
        >
          Criar conta
        </a>
      </>
    );
  }

  const initials = reader.name.slice(0, 2).toUpperCase();

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-2 transition-colors hover:text-white"
      >
        <span
          aria-hidden
          className="flex h-5 w-5 items-center justify-center rounded-full bg-patriota-accent text-[9px] font-bold text-patriota-medium"
        >
          {initials}
        </span>
        <span>
          Olá, <strong className="font-semibold text-white">{reader.name}</strong>
        </span>
        <FiChevronDown size={13} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-lg"
        >
          <a
            href="/conta"
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-slate-700 transition hover:bg-slate-50"
          >
            <FiUser size={14} aria-hidden />A minha conta
          </a>
          {/*
            POST, not a link: a GET logout is fired by link prefetch and
            by corporate mail scanners, silently ending sessions.
          */}
          <form action="/conta/sair" method="post" className="border-t border-slate-100">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-slate-700 transition hover:bg-slate-50"
            >
              <FiLogOut size={14} aria-hidden />
              Terminar sessão
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
