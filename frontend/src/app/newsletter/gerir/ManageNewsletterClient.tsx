"use client";

import { useState, useTransition } from "react";
import {
  newsletterForgetAction,
  newsletterUnsubscribeByTokenAction,
} from "@/app/actions/newsletter";

type Done = "cancelled" | "erased";

/**
 * Two different requests, deliberately separate.
 *
 * "Cancelar" leaves a suppression record — the address stays, marked as
 * cancelled, precisely so nothing writes to it again. "Apagar os meus
 * dados" removes the row. Collapsing them into one button would mean
 * either never honouring an erasure request or losing the record that
 * keeps somebody off the list, and this table had no way to do the
 * first at all until now.
 */
export function ManageNewsletterClient({
  token,
  email,
  cancelled,
}: {
  token: string;
  email: string;
  cancelled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingErase, setConfirmingErase] = useState(false);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, as: Done) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error ?? "Não foi possível concluir o pedido.");
        return;
      }
      setDone(as);
    });
  }

  if (done) {
    return (
      <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] font-semibold text-emerald-800">
        {done === "cancelled"
          ? "Subscrição cancelada. Não voltará a receber a newsletter."
          : "Dados apagados. Já não temos este endereço nas nossas listas."}
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-[14px] leading-relaxed text-slate-600">
        Esta ligação é da subscrição de{" "}
        <strong className="break-all text-slate-900">{email}</strong>.
        {cancelled
          ? " Esta subscrição já está cancelada — pode apagar os dados se quiser."
          : ""}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700"
        >
          {error}
        </p>
      )}

      <div className="mt-6 space-y-3">
        {!cancelled && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => newsletterUnsubscribeByTokenAction(token), "cancelled")
            }
            className="w-full rounded-xl bg-rose-600 py-3 text-[14px] font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
          >
            {pending ? "A cancelar…" : "Cancelar subscrição"}
          </button>
        )}

        {confirmingErase ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-[13px] text-amber-900">
              Vamos apagar o endereço e o nome. Não fica registo nenhum, por
              isso não poderemos impedir que alguém volte a subscrever este
              endereço mais tarde.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmingErase(false)}
                className="flex-1 rounded-lg border border-amber-300 bg-white py-2 text-[13px] font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
              >
                Voltar atrás
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => newsletterForgetAction(token), "erased")}
                className="flex-1 rounded-lg bg-slate-900 py-2 text-[13px] font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
              >
                {pending ? "A apagar…" : "Sim, apagar"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmingErase(true)}
            className="w-full rounded-xl border border-slate-300 py-3 text-[14px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Apagar os meus dados
          </button>
        )}
      </div>
    </div>
  );
}
