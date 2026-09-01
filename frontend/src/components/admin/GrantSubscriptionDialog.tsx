"use client";

import { useEffect, useRef, useState } from "react";

/** Days from today, or null for a subscription with no end date. */
const PRESETS: { label: string; days: number | null }[] = [
  { label: "1 mês", days: 30 },
  { label: "3 meses", days: 90 },
  { label: "1 ano", days: 365 },
  { label: "Sem fim", days: null },
];

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Giving a reader a subscription they did not pay for.
 *
 * The presets are the shapes this actually takes in a newsroom — a
 * month as an apology, a year for a columnist — with a date field
 * underneath for anything else. "Sem fim" is a deliberate click and not
 * the state of an empty form, because a subscription nobody ever
 * reviews is the one that gets forgotten.
 */
export function GrantSubscriptionDialog({
  readerLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  readerLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (opts: { until?: string; note?: string }) => void;
}) {
  const [until, setUntil] = useState<string>(isoDaysFromNow(30));
  const [note, setNote] = useState("");
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const today = new Date().toISOString().slice(0, 10);
  // The server refuses a date in the past — a grant that lapses on its
  // way out of the endpoint. Say so here instead of letting them submit.
  const inPast = until !== "" && until <= today;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Oferecer assinatura a ${readerLabel}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 className="text-lg font-black text-[#0F2C6B]">
          Oferecer assinatura
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {readerLabel} passa a ler os artigos exclusivos, sem pagar.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((preset, i) => {
            const value = preset.days === null ? "" : isoDaysFromNow(preset.days);
            const on = until === value;
            return (
              <button
                key={preset.label}
                ref={i === 0 ? firstRef : undefined}
                type="button"
                onClick={() => setUntil(value)}
                aria-pressed={on}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  on
                    ? "bg-[#0F2C6B] text-white"
                    : "border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <label
          htmlFor="grant-until"
          className="mt-4 block text-[10px] font-bold uppercase tracking-wider text-gray-500"
        >
          Termina em
        </label>
        <input
          id="grant-until"
          type="date"
          value={until}
          min={today}
          onChange={(e) => setUntil(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-[#0F2C6B] focus:ring-2 focus:ring-[#0F2C6B]/10"
        />
        <p className="mt-1 text-xs text-gray-400">
          {until === ""
            ? "Sem data de fim — dura até alguém a retirar."
            : "Ao chegar a esta data volta a ser um leitor gratuito, sozinho."}
        </p>

        <label
          htmlFor="grant-note"
          className="mt-4 block text-[10px] font-bold uppercase tracking-wider text-gray-500"
        >
          Motivo
        </label>
        <textarea
          id="grant-note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 280))}
          rows={2}
          placeholder="Ex.: colunista convidado."
          className="mt-1 w-full resize-none rounded-lg border border-gray-200 p-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none transition focus:border-[#0F2C6B] focus:ring-2 focus:ring-[#0F2C6B]/10"
        />
        <p className="mt-1 text-xs text-gray-400">
          Só para a redacção. O leitor não vê este texto.
        </p>

        {inPast && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            A data tem de ser no futuro.
          </p>
        )}

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
            disabled={busy || inPast}
            onClick={() =>
              onConfirm({
                until: until || undefined,
                note: note.trim() || undefined,
              })
            }
            className="rounded-lg bg-[#0F2C6B] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#1A3A7A] disabled:opacity-50"
          >
            {busy ? "A oferecer…" : "Oferecer"}
          </button>
        </div>
      </div>
    </div>
  );
}
