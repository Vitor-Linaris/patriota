"use client";

import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4" noValidate>
      {/* Email */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="email"
          className="text-[10px] font-bold uppercase tracking-[0.5px] text-white/60"
        >
          E-mail de acesso
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="utilizador@opatriota.pt"
          className="h-[50px] rounded-[12px] border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-patriota-accent/50 focus:bg-white/[0.07]"
        />
      </div>

      {/* Password */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="password"
            className="text-[10px] font-bold uppercase tracking-[0.5px] text-white/60"
          >
            Palavra-passe
          </label>
          <a
            href="#"
            className="text-[10px] font-semibold text-patriota-accent/70 transition hover:text-patriota-accent"
          >
            Recuperar acesso
          </a>
        </div>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="••••••••••"
            className="h-[50px] w-full rounded-[12px] border border-white/10 bg-white/5 pl-4 pr-20 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-patriota-accent/50 focus:bg-white/[0.07]"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-[0.5px] text-white/40 transition hover:text-white/70"
          >
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-[10px] border border-red-400/30 bg-red-500/10 px-4 py-2 text-xs text-red-200"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 h-12 rounded-[12px] bg-patriota-accent text-sm font-black text-patriota-ink shadow-[0_10px_15px_-3px_rgba(255,204,102,0.1),0_4px_6px_-4px_rgba(255,204,102,0.1)] transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending ? "A autenticar…" : "Entrar no backoffice"}
      </button>
    </form>
  );
}
