"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { readerLoginAction, type FormState } from "../actions";
import { fieldClass, labelClass, submitClass } from "../AuthShell";

const initialState: FormState = {};

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(
    readerLoginAction,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {/* Carried through the form so the reader lands back where they were
          when a page bounced them here. Sanitised server-side by safeNext. */}
      <input type="hidden" name="next" value={next} />

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
        <div className="flex items-center justify-between">
          <label htmlFor="password" className={labelClass}>
            Palavra-passe
          </label>
          <Link
            href="/conta/recuperar"
            className="text-[11px] font-semibold text-patriota-pure transition hover:underline"
          >
            Esqueceu-se?
          </Link>
        </div>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="••••••••••"
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
        {isPending ? "A entrar…" : "Iniciar sessão"}
      </button>
    </form>
  );
}
