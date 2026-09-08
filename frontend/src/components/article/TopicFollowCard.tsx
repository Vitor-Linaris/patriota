"use client";

import { useCallback, useEffect, useState } from "react";

interface TopicState {
  /** Root of the article's category — see the same note on ReaderActions:
   *  an article under "Portugal › Madeira › Funchal" is followed via
   *  "Portugal", the section a reader can actually subscribe to. */
  categoryId: string;
  categoryName: string | null;
  followingCategory: boolean;
}

/**
 * The "Acompanhar tema" card in the article sidebar.
 *
 * Same follow/unfollow the star icon in ReaderActions already does
 * (same /api/conta/state + /api/conta/favorites contract) — this is
 * the same feature, just as a named, full-width call to action instead
 * of an icon in the byline. The two fetch independently on purpose:
 * this card and ReaderActions sit in unrelated branches of the page
 * (byline row vs. sidebar), and every reader-state island on this page
 * hydrates on its own so the server-rendered HTML stays identical for
 * every visitor.
 *
 * Two things the client asked for by name:
 *   - The button names the section ("Seguir Portugal"), not a generic
 *     "Seguir tema" — a reader should know what they're about to
 *     subscribe to before clicking.
 *   - Signed OUT, the card still appears (hiding it is how a feature
 *     goes undiscovered), but the button reads "Criar conta" and goes
 *     to registration instead of toggling anything there's no session
 *     to attach to.
 */
export function TopicFollowCard({
  articleId,
}: {
  articleId: string;
}) {
  const [state, setState] = useState<TopicState | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/conta/state?articleId=${encodeURIComponent(articleId)}`,
        );
        if (cancelled) return;
        if (res.status === 401) {
          setAnonymous(true);
          return;
        }
        if (!res.ok) return;
        setState((await res.json()) as TopicState);
      } catch {
        // The card just stays in its loading shape — the article page
        // itself must never fail because of this island.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  const toggle = useCallback(async () => {
    if (!state) return;
    const on = state.followingCategory;
    setBusy(true);
    // Optimistic, reverted below if the server disagrees — same
    // pattern as ReaderActions.
    setState((s) => (s === null ? s : { ...s, followingCategory: !on }));
    try {
      const res = await fetch("/api/conta/favorites", {
        method: on ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "category", id: state.categoryId }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setState((s) => (s === null ? s : { ...s, followingCategory: on }));
    } finally {
      setBusy(false);
    }
  }, [state]);

  const label = state?.categoryName ?? "este tema";

  return (
    <section className="rounded-lg bg-patriota-dark p-6 text-white shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wider text-patriota-accent">
        Acompanhar tema
      </p>
      <h2 className="mt-2 text-[18px] font-black leading-snug">
        Receba alertas
      </h2>
      <p className="mt-2 text-[13px] text-white/70">
        Avisamos quando este tema voltar a ser notícia.
      </p>

      {anonymous ? (
        <a
          href="/conta/registar"
          className="mt-5 flex h-10 w-full items-center justify-center rounded-md bg-patriota-accent text-[13px] font-bold text-patriota-ink transition hover:brightness-105"
        >
          Criar conta
        </a>
      ) : (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={!state || busy}
          aria-pressed={state?.followingCategory ?? false}
          className={`mt-5 h-10 w-full rounded-md text-[13px] font-bold transition disabled:opacity-60 ${
            state?.followingCategory
              ? "border border-patriota-accent bg-transparent text-patriota-accent"
              : "bg-patriota-accent text-patriota-ink hover:brightness-105"
          }`}
        >
          {state?.followingCategory ? `A seguir ${label}` : `Seguir ${label}`}
        </button>
      )}
    </section>
  );
}
