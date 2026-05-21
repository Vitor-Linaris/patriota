"use client";

import { useEffect, useState, useTransition } from "react";
import {
  publicSubscribeAction,
  publicUnsubscribeAction,
} from "@/app/actions/newsletter";

type Mode = "subscribe" | "unsubscribe";

interface NewsletterModalProps {
  open: boolean;
  initialMode?: Mode;
  onClose: () => void;
}

/**
 * Subscribe + unsubscribe in a single modal. The unsubscribe path
 * requires nothing more than an e-mail, but we gate the actual
 * cancellation behind a confirm step ("Tem a certeza?") so a stray
 * click doesn't lose a reader. Pure client-side; the server actions
 * handle validation and persistence.
 */
export function NewsletterModal({
  open,
  initialMode = "subscribe",
  onClose,
}: NewsletterModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "ok"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Reset every time the modal opens — the previous interaction's
  // status/draft shouldn't leak into the next visit.
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setName("");
      setEmail("");
      setConfirming(false);
      setStatus({ kind: "idle" });
    }
  }, [open, initialMode]);

  // Close on Escape, lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const submitSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await publicSubscribeAction(email, name);
      if (!res.ok) {
        setStatus({ kind: "error", message: res.error });
        return;
      }
      setStatus({
        kind: "ok",
        message: "Subscrição registada. Obrigado!",
      });
      setEmail("");
      setName("");
    });
  };

  const confirmUnsubscribe = () => {
    startTransition(async () => {
      const res = await publicUnsubscribeAction(email);
      if (!res.ok) {
        setStatus({ kind: "error", message: res.error });
        return;
      }
      setStatus({
        kind: "ok",
        message:
          "Pedido recebido. Se o e-mail estiver subscrito, foi cancelado.",
      });
      setEmail("");
      setConfirming(false);
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Newsletter — subscrever ou cancelar"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with brand stripe */}
        <div className="bg-patriota-dark px-6 pb-6 pt-7 text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-patriota-accent">
                Newsletter
              </p>
              <h2 className="mt-1 text-[22px] font-black leading-tight">
                {mode === "subscribe"
                  ? "Receba as manchetes do dia"
                  : "Cancelar subscrição"}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-white/70">
                {mode === "subscribe"
                  ? "Curadoria editorial diária, sem spam. Cancelamento imediato a qualquer momento."
                  : "Indique o e-mail subscrito. Removemo-lo da lista de imediato."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="-mr-2 -mt-1 text-2xl leading-none text-white/40 transition-colors hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {/* Mode toggle */}
          <div className="mb-5 flex rounded-xl bg-slate-100 p-1">
            {(["subscribe", "unsubscribe"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setConfirming(false);
                  setStatus({ kind: "idle" });
                }}
                className={`flex-1 rounded-lg py-2 text-[13px] font-bold transition-all ${
                  mode === m
                    ? "bg-white text-patriota-dark shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {m === "subscribe" ? "Subscrever" : "Cancelar"}
              </button>
            ))}
          </div>

          {mode === "subscribe" ? (
            <form onSubmit={submitSubscribe} className="space-y-3">
              <div>
                <label
                  htmlFor="nl-name"
                  className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                >
                  Nome (opcional)
                </label>
                <input
                  id="nl-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="O seu nome"
                  maxLength={80}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] transition-colors focus:border-patriota-medium focus:outline-none focus:ring-2 focus:ring-patriota-medium/20"
                />
              </div>
              <div>
                <label
                  htmlFor="nl-email"
                  className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                >
                  E-mail
                </label>
                <input
                  id="nl-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] transition-colors focus:border-patriota-medium focus:outline-none focus:ring-2 focus:ring-patriota-medium/20"
                />
              </div>
              {status.kind === "ok" && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">
                  ✓ {status.message}
                </div>
              )}
              {status.kind === "error" && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">
                  {status.message}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-[14px] font-semibold text-slate-500 transition-colors hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 rounded-xl bg-patriota-dark py-2.5 text-[14px] font-bold text-white transition-colors hover:bg-patriota-medium disabled:opacity-50"
                >
                  {pending ? "A enviar…" : "Subscrever"}
                </button>
              </div>
              <p className="text-center text-[11px] text-slate-400">
                Ao subscrever aceita os{" "}
                <a
                  href="/p/termos"
                  className="underline hover:text-slate-600"
                >
                  Termos de Uso
                </a>{" "}
                e a{" "}
                <a
                  href="/p/privacidade"
                  className="underline hover:text-slate-600"
                >
                  Política de Privacidade
                </a>
                .
              </p>
            </form>
          ) : (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="nl-uns-email"
                  className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                >
                  E-mail subscrito
                </label>
                <input
                  id="nl-uns-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setConfirming(false);
                  }}
                  placeholder="email@exemplo.com"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] transition-colors focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
              {status.kind === "ok" && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">
                  ✓ {status.message}
                </div>
              )}
              {status.kind === "error" && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">
                  {status.message}
                </div>
              )}
              {confirming ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-[13px] text-amber-900">
                    Tem a certeza? Vamos remover{" "}
                    <strong className="break-all">{email}</strong> da
                    lista. Pode subscrever novamente quando quiser.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={pending}
                      className="flex-1 rounded-lg border border-amber-300 bg-white py-2 text-[13px] font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
                    >
                      Voltar atrás
                    </button>
                    <button
                      type="button"
                      onClick={confirmUnsubscribe}
                      disabled={pending}
                      className="flex-1 rounded-lg bg-rose-600 py-2 text-[13px] font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
                    >
                      {pending ? "A cancelar…" : "Sim, cancelar"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-xl border border-slate-200 py-2.5 text-[14px] font-semibold text-slate-500 transition-colors hover:bg-slate-50"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!email.trim()) {
                        setStatus({
                          kind: "error",
                          message: "Indique o e-mail subscrito.",
                        });
                        return;
                      }
                      setStatus({ kind: "idle" });
                      setConfirming(true);
                    }}
                    disabled={pending}
                    className="flex-1 rounded-xl bg-rose-600 py-2.5 text-[14px] font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
                  >
                    Cancelar subscrição
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
