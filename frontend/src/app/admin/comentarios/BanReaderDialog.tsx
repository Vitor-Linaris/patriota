"use client";

import { useEffect, useRef, useState } from "react";
import type { SuspensionDuration } from "./actions";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Suspender ${readerLabel}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-[14px] border border-white/10 bg-patriota-dark p-5 text-white shadow-2xl"
      >
        <h2 className="text-[16px] font-black">Suspender leitor</h2>
        <p className="mt-1 text-[13px] text-white/50">
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
              className={`flex items-center justify-between rounded-[10px] border px-3 py-2.5 text-left transition ${
                duration === o.key
                  ? "border-patriota-accent bg-patriota-accent/15"
                  : "border-white/10 hover:border-white/30"
              }`}
            >
              <span className="text-[14px] font-bold">{o.label}</span>
              <span className="text-[12px] text-white/40">{o.hint}</span>
            </button>
          ))}
        </div>

        <label className="mt-4 block text-[12px] font-bold uppercase tracking-wide text-white/40">
          Motivo
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 280))}
          rows={2}
          placeholder="Ex.: insultos repetidos a outros leitores."
          className="mt-1 w-full resize-none rounded-[10px] border border-white/10 bg-white/[0.04] p-2.5 text-[13px] text-white placeholder:text-white/25 outline-none transition focus:border-patriota-accent"
        />
        {/* Said plainly, because moderators write these assuming nobody
            reads them. The reader is shown this text when they next try
            to sign in. */}
        <p className="mt-1 text-[11px] text-white/35">
          O leitor vê este texto ao tentar entrar. {reason.length}/280
        </p>

        <label className="mt-3 flex items-start gap-2 text-[13px] text-white/70">
          <input
            type="checkbox"
            checked={purge}
            onChange={(e) => setPurge(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-patriota-accent"
          />
          <span>
            Eliminar também todos os comentários deste leitor
            <span className="block text-[11px] text-white/35">
              As respostas de outros mantêm-se, sem perder o fio.
            </span>
          </span>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-[8px] border border-white/20 px-4 py-2 text-[13px] text-white/80 transition hover:border-white/40 disabled:opacity-50"
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
            className="rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "A suspender…" : "Suspender"}
          </button>
        </div>
      </div>
    </div>
  );
}
