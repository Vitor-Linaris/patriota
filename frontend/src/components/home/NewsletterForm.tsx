"use client";

import { useState, useTransition } from "react";
import { publicSubscribeAction } from "@/app/actions/newsletter";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await publicSubscribeAction(email);
      if (!res.ok) {
        setStatus({ kind: "error", message: res.error });
        return;
      }
      setStatus({ kind: "ok" });
      setEmail("");
    });
  };

  return (
    <form className="mt-5 flex flex-col gap-3" onSubmit={submit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="O seu e-mail"
        required
        className="h-10 rounded-md border border-white/10 bg-white/5 px-4 text-[13px] text-white placeholder:text-white/40 outline-none focus:border-patriota-accent/50"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-md bg-patriota-accent text-[13px] font-bold text-patriota-ink transition hover:brightness-105 disabled:opacity-50"
      >
        {pending ? "A subscrever…" : "Subscrever gratuitamente"}
      </button>
      {status.kind === "ok" && (
        <p className="text-[12px] font-semibold text-patriota-accent">
          Subscrição registada. Obrigado!
        </p>
      )}
      {status.kind === "error" && (
        <p className="text-[12px] font-semibold text-rose-300">
          {status.message}
        </p>
      )}
    </form>
  );
}
