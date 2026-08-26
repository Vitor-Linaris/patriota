"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { readerRegisterAction, type FormState } from "../actions";
import { fieldClass, labelClass, submitClass } from "../AuthShell";

const initialState: FormState = {};

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(
    readerRegisterAction,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);

  // On success the backend deliberately says nothing about whether the
  // address was free, so there is nothing to redirect to — we swap the
  // form out for the notice instead.
  if (state.notice) {
    return (
      <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-4">
        <p className="text-[14px] font-semibold text-emerald-900">
          Verifique o seu e-mail
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-emerald-800">
          {state.notice}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className={labelClass}>
          Nome <span className="font-normal normal-case">(opcional)</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Como quer aparecer nos comentários"
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className={labelClass}>
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="o.seu.email@exemplo.pt"
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className={labelClass}>
          Palavra-passe
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={10}
            autoComplete="new-password"
            placeholder="Pelo menos 10 caracteres"
            className={`${fieldClass} pr-20`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label={
              showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"
            }
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-semibold uppercase tracking-[0.4px] text-slate-400 transition hover:text-slate-600"
          >
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        <p className="text-[12px] text-slate-400">
          Escolha uma palavra-passe longa. O comprimento protege mais do que
          símbolos.
        </p>
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
        {isPending ? "A criar conta…" : "Criar conta gratuita"}
      </button>

      <p className="text-center text-[12px] leading-relaxed text-slate-400">
        Ao criar conta aceita os{" "}
        <Link href="/p/termos" className="underline hover:text-slate-600">
          Termos
        </Link>{" "}
        e a{" "}
        <Link href="/p/privacidade" className="underline hover:text-slate-600">
          Política de Privacidade
        </Link>
        .
      </p>
    </form>
  );
}
