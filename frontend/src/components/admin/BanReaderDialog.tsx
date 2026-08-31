"use client";

import { useEffect, useRef, useState } from "react";
/**
 * Kept here rather than imported from a page's actions file: two admin
 * screens hand out bans, and the vocabulary belongs to the dialog that
 * defines it. Mirrors SUSPENSION_DURATIONS in reader-suspension.ts.
 */
export type SuspensionDuration = "DIAS_15" | "DIAS_30" | "PERMANENTE";

const OPTIONS: { key: SuspensionDuration; label: string; hint: string }[] = [
  { key: "DIAS_15", label: "15 dias", hint: "Primeira infracção" },
  { key: "DIAS_30", label: "30 dias", hint: "Reincidência" },
  { key: "PERMANENTE", label: "Definitivo", hint: "Sem data de fim" },
];

/**
 * Confirmation for banning a reader.
 *
 * A dialog rather than the one-click the other moderation buttons use:
 * approving a comment is about a comment, and banning is about a person.
 * The extra step is the point — it makes the moderator name a duration
 * and, if they want it, tick the box that also wipes what the reader
 * wrote. Nothing here is undoable by pressing the button again.
 */
export function BanReaderDialog({
  readerLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  readerLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (
    duration: SuspensionDuration,
    opts: { reason?: string; purgeComments?: boolean },
  ) => void;
}) {
  const [duration, setDuration] = useState<SuspensionDuration>("DIAS_15");
  const [reason, setReason] = useState("");
  const [purge, setPurge] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Suspender ${readerLabel}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 className="text-lg font-black text-[#0F2C6B]">Suspender leitor</h2>
        <p className="mt-1 text-sm text-gray-500">
          {readerLabel} deixa de poder comentar. A sessão actual é terminada
          de imediato.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {OPTIONS.map((o, i) => (
            <button
              key={o.key}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              onClick={() => setDuration(o.key)}
              aria-pressed={duration === o.key}
              className={`flex items-center justify-between rounded-lg border-2 px-3 py-2.5 text-left transition-all ${
                duration === o.key
                  ? "border-[#0F2C6B] bg-[#F0F2F7]"
                  : "border-gray-100 hover:border-gray-200"
              }`}
            >
              <span className="text-sm font-bold text-gray-800">
                {o.label}
              </span>
              <span className="text-xs text-gray-400">{o.hint}</span>
            </button>
          ))}
        </div>

        <label className="mt-4 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Motivo
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 280))}
          rows={2}
          placeholder="Ex.: insultos repetidos a outros leitores."
          className="mt-1 w-full resize-none rounded-lg border border-gray-200 p-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none transition focus:border-[#0F2C6B] focus:ring-2 focus:ring-[#0F2C6B]/10"
        />
        {/* Said plainly, because moderators write these assuming nobody
            reads them. The reader is shown this text when they next try
            to sign in. */}
        <p className="mt-1 text-xs text-gray-400">
          O leitor vê este texto ao tentar entrar. {reason.length}/280
        </p>

        <label className="mt-3 flex items-start gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={purge}
            onChange={(e) => setPurge(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#0F2C6B]"
          />
          <span>
            Eliminar também todos os comentários deste leitor
            <span className="block text-xs text-gray-400">
              As respostas de outros mantêm-se, sem perder o fio.
            </span>
          </span>
        </label>

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
            disabled={busy}
            onClick={() =>
              onConfirm(duration, {
                reason: reason.trim() || undefined,
                purgeComments: purge,
              })
            }
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "A suspender…" : "Suspender"}
          </button>
        </div>
      </div>
    </div>
  );
}
