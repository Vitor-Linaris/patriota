"use client";

import { useActionState } from "react";
import { readerForgotPasswordAction, type FormState } from "../actions";
import { fieldClass, labelClass, submitClass } from "../AuthShell";

const initialState: FormState = {};

export function ForgotForm() {
  const [state, formAction, isPending] = useActionState(
    readerForgotPasswordAction,
    initialState,
  );

  if (state.notice) {
    return (
      <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-4">
        <p className="text-[13px] leading-relaxed text-emerald-800">
          {state.notice}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className={labelClass}>
          E-mail da conta
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

      {state.error ? (
        <p
          role="alert"
          className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={submitClass}>
        {isPending ? "A enviar…" : "Enviar instruções"}
      </button>
    </form>
  );
}
