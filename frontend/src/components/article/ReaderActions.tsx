"use client";

import { useCallback, useEffect, useState } from "react";

interface ReaderState {
  /** Comes back from the API so the category toggle does not need it as a prop. */
  categoryId: string;
  saved: boolean;
  followingCategory: boolean;
  commentCount: number;
}

/**
 * The heart and the "seguir categoria" toggle.
 *
 * Fetched CLIENT-side on mount, deliberately. categoria/[slug] runs
 * generateStaticParams and is prerendered, and the article page is cached
 * SSR — baking per-reader state into either would serve one visitor's
 * hearts to everyone. Keeping it client-only means the HTML is identical
 * for every visitor and only this small island varies.
 *
 * Anonymous visitors still see the controls: hiding them means nobody
 * ever discovers the feature exists. They link to the login page instead.
 */
export function ReaderActions({
  articleId,
  slug,
  categoryName,
}: {
  articleId: string;
  slug: string;
  categoryName: string;
}) {
  const [state, setState] = useState<ReaderState | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState<"article" | "category" | null>(null);

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
        setState((await res.json()) as ReaderState);
      } catch {
        // The article must render even if this island fails.
      }
    })();

    // Reading-history ping. Fire-and-forget: a failure here must never
    // surface to the reader.
    void fetch("/api/conta/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId }),
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [articleId]);

  const toggle = useCallback(
    async (type: "article" | "category") => {
      if (!state) return;
      const on = type === "article" ? state.saved : state.followingCategory;
      setBusy(type);

      // Optimistic: the toggle must feel instant, and it is reverted below
      // if the server disagrees.
      setState((s) =>
        s === null
          ? s
          : type === "article"
            ? { ...s, saved: !on }
            : { ...s, followingCategory: !on },
      );

      try {
        const res = await fetch("/api/conta/favorites", {
          method: on ? "DELETE" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            id: type === "article" ? articleId : state.categoryId,
          }),
        });
        if (!res.ok) throw new Error("failed");
      } catch {
        setState((s) =>
          s === null
            ? s
            : type === "article"
              ? { ...s, saved: on }
              : { ...s, followingCategory: on },
        );
      } finally {
        setBusy(null);
      }
    },
    [state, articleId],
  );

  const loginHref = `/conta/entrar?next=${encodeURIComponent(`/artigo/${slug}`)}`;

  if (anonymous) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={loginHref}
          title="Inicie sessão para guardar"
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-500 transition hover:border-slate-400 hover:text-slate-900"
        >
          <span aria-hidden>♡</span> Guardar
        </a>
      </div>
    );
  }

  // Nothing until the state lands, so the heart never flashes the wrong way.
  if (!state) {
    return <div className="h-[34px] w-[104px]" aria-hidden />;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle("article")}
        disabled={busy === "article"}
        aria-pressed={state.saved}
        title={state.saved ? "Remover dos guardados" : "Guardar esta notícia"}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-60 ${
          state.saved
            ? "border-rose-300 bg-rose-50 text-rose-700"
            : "border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900"
        }`}
      >
        <span aria-hidden>{state.saved ? "♥" : "♡"}</span>
        {state.saved ? "Guardada" : "Guardar"}
      </button>

      <button
        type="button"
        onClick={() => void toggle("category")}
        disabled={busy === "category"}
        aria-pressed={state.followingCategory}
        title={
          state.followingCategory
            ? `Deixar de seguir ${categoryName}`
            : `Receber novidades de ${categoryName}`
        }
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-60 ${
          state.followingCategory
            ? "border-patriota-pure/40 bg-patriota-pure/10 text-patriota-pure"
            : "border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900"
        }`}
      >
        <span aria-hidden>{state.followingCategory ? "★" : "☆"}</span>
        {state.followingCategory ? "A seguir" : `Seguir ${categoryName}`}
      </button>
    </div>
  );
}
