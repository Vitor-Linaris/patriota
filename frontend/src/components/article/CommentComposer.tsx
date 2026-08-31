"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Posting box. Only this piece is client-side — the thread itself renders
 * on the server so comments are indexable.
 *
 * On success it calls router.refresh(), which re-runs the server component
 * and pulls the new comment back through the normal render path rather
 * than us maintaining a parallel client-side copy of the list.
 */
export function CommentComposer({
  slug,
  parentId,
  onDone,
  autoFocus,
}: {
  slug: string;
  parentId?: string;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mirrors MAX_BODY / MAX_WORDS in comments.service.ts. The character
  // cap still clamps as you type; the word cap deliberately does NOT —
  // truncating mid-sentence while someone is composing is hostile, and
  // unlike a character overflow they cannot see it coming. It disables
  // the button and says why instead.
  const MAX_CHARS = 2000;
  const MAX_WORDS = 200;
  const words = body.trim() === "" ? 0 : body.trim().split(/\s+/).length;
  const overWordLimit = words > MAX_WORDS;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length < 2 || overWordLimit || busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/conta/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, body, ...(parentId ? { parentId } : {}) }),
      });

      if (res.status === 401) {
        setError("A sua sessão expirou. Inicie sessão novamente para comentar.");
        return;
      }
      if (res.status === 403) {
        setError("Confirme o seu e-mail antes de comentar.");
        return;
      }
      if (res.status === 429) {
        setError("Está a comentar demasiado depressa. Aguarde um momento.");
        return;
      }
      if (!res.ok) {
        setError("Não foi possível publicar o comentário. Tente novamente.");
        return;
      }

      setBody("");
      // Every comment starts PENDENTE, so say so — otherwise the reader
      // reloads, sees nothing, and posts again.
      setNotice("Comentário enviado. Ficará visível após moderação.");
      onDone?.();
      router.refresh();
    } catch {
      setError("Não foi possível contactar o servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_CHARS))}
        rows={parentId ? 3 : 4}
        autoFocus={autoFocus}
        placeholder={
          parentId ? "Escreva a sua resposta…" : "Escreva o seu comentário…"
        }
        className="w-full resize-y rounded-[10px] border border-slate-300 bg-white p-3 text-[14px] leading-relaxed text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-patriota-pure focus:ring-2 focus:ring-patriota-pure/15"
      />

      {error ? (
        <p
          role="alert"
          className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-[8px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          {notice}
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <span
          className={`text-[12px] ${
            overWordLimit
              ? "font-semibold text-red-600"
              : words > MAX_WORDS - 30
                ? "text-amber-600"
                : "text-slate-400"
          }`}
        >
          {overWordLimit
            ? `${words} palavras — o limite é ${MAX_WORDS}`
            : `${words} / ${MAX_WORDS} palavras`}
        </span>
        <div className="flex gap-2">
          {parentId && onDone ? (
            <button
              type="button"
              onClick={onDone}
              className="rounded-[8px] border border-slate-300 px-3 py-1.5 text-[13px] text-slate-600 transition hover:border-slate-400"
            >
              Cancelar
            </button>
          ) : null}
          <button
            type="submit"
            disabled={busy || body.trim().length < 2 || overWordLimit}
            className="rounded-[8px] bg-patriota-pure px-4 py-1.5 text-[13px] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "A enviar…" : parentId ? "Responder" : "Comentar"}
          </button>
        </div>
      </div>
    </form>
  );
}
