"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Sends a reader to Stripe Checkout.
 *
 * A button rather than a link because the destination does not exist
 * until it is asked for: the checkout session is created per attempt,
 * carries this reader's id, and expires. There is no URL to put in an
 * href ahead of time.
 *
 * It finds out whether the visitor is signed in by ASKING — a 401 from
 * the checkout call means no session, and the answer is to send them to
 * sign in and come back. Taking a `signedIn` prop instead would mean
 * every page that renders this button has to read the reader cookie,
 * and reading a cookie in a Server Component opts that page out of
 * static generation. On /p/assinatura that would have made every
 * unrelated static page dynamic too.
 *
 * Signing in first, rather than paying first: a payment with no account
 * to attach it to is a payment nobody can use.
 */
export function SubscribeButton({
  returnTo,
  className,
  children,
}: {
  /** Where to come back to after signing in. */
  returnTo: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
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
        body: JSON.stringify({ action: "checkout" }),
      });

      if (res.status === 401) {
        router.push(`/conta/entrar?next=${encodeURIComponent(returnTo)}`);
        return;
      }

      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        message?: string;
      };

      if (!res.ok || !data.url) {
        setError(
          data.message ?? "Não foi possível abrir o pagamento. Tente novamente.",
        );
        return;
      }
      // A full navigation, not router.push: Stripe Checkout is another
      // origin and the client router cannot take us there.
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
