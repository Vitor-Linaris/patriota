"use client";

import { useCallback, useEffect, useState } from "react";
import { FaBookmark, FaRegBookmark, FaRegStar, FaStar } from "react-icons/fa6";
import { ICON_BUTTON } from "./ShareButtons";

interface ReaderState {
  /** Comes back from the API so the category toggle needs no extra prop. */
  categoryId: string;
  saved: boolean;
  followingCategory: boolean;
  commentCount: number;
}

/**
 * Save and follow, as icons on the author row.
 *
 * Fetched CLIENT-side on mount, deliberately. categoria/[slug] runs
 * generateStaticParams and is prerendered, and the article page is cached
 * SSR — baking per-reader state into either would serve one visitor's
 * bookmarks to everyone. Keeping it client-only means the HTML is
 * identical for every visitor and only this small island varies.
 *
 * Anonymous visitors still see the controls: hiding them means nobody
 * ever discovers the feature exists. They link to the login page.
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

      // Optimistic: the toggle must feel instant, and it is reverted
      // below if the server disagrees.
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
      <a
        href={loginHref}
        aria-label="Inicie sessão para guardar esta notícia"
        title="Inicie sessão para guardar"
        className={ICON_BUTTON}
      >
        <FaRegBookmark size={14} aria-hidden />
      </a>
    );
  }

  // Reserve the space so the row does not jump when the state lands, and
  // so the bookmark never flashes the wrong way.
  if (!state) {
    return <div className="h-9 w-[78px]" aria-hidden />;
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void toggle("article")}
        disabled={busy === "article"}
        aria-pressed={state.saved}
        aria-label={
          state.saved ? "Remover dos guardados" : "Guardar esta notícia"
        }
        title={state.saved ? "Remover dos guardados" : "Guardar esta notícia"}
        className={`${ICON_BUTTON} disabled:opacity-60 ${
          state.saved
            ? "border-patriota-medium bg-patriota-medium/10 text-patriota-medium"
            : ""
        }`}
      >
        {state.saved ? (
          <FaBookmark size={14} aria-hidden />
        ) : (
          <FaRegBookmark size={14} aria-hidden />
        )}
      </button>

      <button
        type="button"
        onClick={() => void toggle("category")}
        disabled={busy === "category"}
        aria-pressed={state.followingCategory}
        aria-label={
          state.followingCategory
            ? `Deixar de seguir ${categoryName}`
            : `Seguir ${categoryName}`
        }
        title={
          state.followingCategory
            ? `Deixar de seguir ${categoryName}`
            : `Seguir ${categoryName}`
        }
        className={`${ICON_BUTTON} disabled:opacity-60 ${
          state.followingCategory
            ? "border-amber-400 bg-amber-50 text-amber-500"
            : ""
        }`}
      >
        {state.followingCategory ? (
          <FaStar size={14} aria-hidden />
        ) : (
          <FaRegStar size={14} aria-hidden />
        )}
      </button>
    </div>
  );
}
