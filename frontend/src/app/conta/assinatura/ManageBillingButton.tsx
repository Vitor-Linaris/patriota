"use client";

import { useState } from "react";

/**
 * Opens the Stripe billing portal.
 *
 * Same shape as SubscribeButton and for the same reason: the URL is a
 * one-off session created per click, so there is nothing to put in an
 * href ahead of time.
 *
 * Cancelling, changing a card and downloading an invoice all happen on
 * Stripe's pages. None of it is rebuilt here — that is what keeps a card
 * number from ever reaching this site.
 */
export function ManageBillingButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/conta/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "portal" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        message?: string;
      };
      if (!res.ok || !data.url) {
        setError(data.message ?? "Não foi possível abrir a faturação.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Não foi possível contactar o servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={go} disabled={busy} className={className}>
        {busy ? "A abrir…" : children}
      </button>
      {error && (
        <p
          role="alert"
          className="mt-3 w-full rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700"
        >
          {error}
        </p>
      )}
    </>
  );
}
