"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Robust "copy to clipboard" button that:
 *   • Prefers the modern Clipboard API (navigator.clipboard.writeText)
 *     but falls back to the legacy execCommand("copy") path for
 *     contexts where Clipboard is gated (no HTTPS, browser policy,
 *     embedded webviews) — without that fallback the click silently
 *     did nothing and the admin had no idea.
 *   • Surfaces three visible states:
 *       "Copiar" → idle
 *       "Copiado ✓" → success (1.8s)
 *       "Falhou ✕" → failure (1.8s)
 *   • Disables itself while showing the result so a frustrated user
 *     can't smash it and confuse the timer.
 *
 * Designed for tiny inline use (the password reveal modals, the
 * invite-success modal, etc.).
 */
export function CopyButton({
  value,
  className,
  label = "Copiar",
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const flash = (kind: "ok" | "err") => {
    setState(kind);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), 1800);
  };

  async function copy() {
    if (!value) return;
    // Modern path — gated to secure contexts (HTTPS or localhost).
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(value);
        flash("ok");
        return;
      }
    } catch {
      /* fall through to the legacy path */
    }
    // Legacy fallback — works without a secure context. We create a
    // throwaway textarea, copy, and remove it. Behaviour-wise it
    // requires the call to be inside a user-initiated event, which
    // it is (button onClick).
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      flash(ok ? "ok" : "err");
    } catch {
      flash("err");
    }
  }

  const visibleLabel =
    state === "ok" ? "Copiado ✓" : state === "err" ? "Falhou ✕" : label;

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      disabled={state !== "idle"}
      className={
        className ??
        "rounded-lg bg-[#0F2C6B] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1A3A7A] disabled:opacity-100"
      }
    >
      {visibleLabel}
    </button>
  );
}
