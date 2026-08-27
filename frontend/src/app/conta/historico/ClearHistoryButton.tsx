"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Two-step, no browser confirm(): clearing the history is irreversible
 * and a native dialog is easy to dismiss by reflex. The button turns into
 * its own confirmation instead.
 */
export function ClearHistoryButton() {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function clear() {
    startTransition(async () => {
      await fetch("/api/conta/history/clear", { method: "POST" }).catch(() => {});
      setArmed(false);
      router.refresh();
    });
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="rounded-[8px] border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
      >
        Limpar histórico
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-slate-500">Tem a certeza?</span>
      <button
        type="button"
        disabled={isPending}
        onClick={clear}
        className="rounded-[8px] bg-red-600 px-3 py-1.5 text-[13px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        {isPending ? "A limpar…" : "Sim, limpar"}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="rounded-[8px] border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-600 transition hover:border-slate-400"
      >
        Cancelar
      </button>
    </div>
  );
}
