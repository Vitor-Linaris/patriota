"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Confirmation for removing a comment.
 *
 * A dialog rather than the one-click the "Aprovar" button uses, for the
 * same reason BanReaderDialog exists: this cannot be undone by pressing
 * the button again, and the reason typed here is BOTH stored on the row
 * and mailed to whoever wrote the comment — it is not a private note.
 *
 * Deliberately does not delete anything itself. "Eliminar" here only
 * moves the comment to the "Eliminados" tab; a true, permanent delete is
 * a second, separate action offered only from there.
 */
export function DeleteCommentDialog({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= 3;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Eliminar comentário"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 className="text-lg font-black text-[#0F2C6B]">
          Eliminar comentário
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          O autor recebe um e-mail com este motivo.
        </p>

        <label className="mt-4 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Motivo
        </label>
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 280))}
          rows={3}
          placeholder="Ex.: linguagem ofensiva, fora do tema da notícia."
          className="mt-1 w-full resize-none rounded-lg border border-gray-200 p-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none transition focus:border-[#0F2C6B] focus:ring-2 focus:ring-[#0F2C6B]/10"
        />
        <p className="mt-1 text-xs text-gray-400">{reason.length}/280</p>

        {/* The business rule the client asked for, stated plainly: this
            step is reversible-looking on purpose. Permanent deletion is
            a separate, deliberate action taken later from "Eliminados". */}
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Isto não elimina o comentário em definitivo — ele passa para a
          aba <strong>Eliminados</strong>, onde poderá, se quiser,
          eliminá-lo em definitivo.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || !canSubmit}
            onClick={() => onConfirm(trimmed)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "A eliminar…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
