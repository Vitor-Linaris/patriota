"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { readerResetPasswordAction, type FormState } from "../actions";
import { fieldClass, labelClass, submitClass } from "../AuthShell";

const initialState: FormState = {};

export function ResetForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    readerResetPasswordAction,
    initialState,
  );
  const [show, setShow] = useState(false);

  if (state.notice) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-4">
          <p className="text-[14px] font-semibold text-emerald-900">
            Palavra-passe alterada
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-emerald-800">
            {state.notice}
          </p>
        </div>
        <Link
          href="/conta/entrar"
          className={`${submitClass} flex items-center justify-center`}
        >
          Iniciar sessão
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className={labelClass}>
          Nova palavra-passe
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            required
            minLength={10}
            autoComplete="new-password"
            placeholder="Pelo menos 10 caracteres"
            className={`${fieldClass} pr-20`}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-pressed={show}
            aria-label={show ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-semibold uppercase tracking-[0.4px] text-slate-400 transition hover:text-slate-600"
          >
            {show ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={submitClass}>
        {isPending ? "A guardar…" : "Guardar palavra-passe"}
      </button>
    </form>
  );
}
