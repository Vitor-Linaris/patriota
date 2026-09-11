"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Sends a reader to Stripe Checkout for one pacote.
 *
 * Deliberately a near-copy of SubscribeButton, for the same reasons it
 * has: the destination does not exist until it is asked for (a session is
 * created per attempt and expires), and it finds out whether the visitor
 * is signed in by ASKING — a 401 means no session, and the answer is to
 * send them to sign in and come back here.
 *
 * No `signedIn` prop, and that is load-bearing: taking one would force
 * every page rendering this button to read the reader cookie, and reading
 * a cookie in a Server Component opts that page out of static generation.
 * /pacotes is a static listing today, and this button has to be droppable
 * onto it without turning it dynamic.
 *
 * A 409 ("Já tem este pacote") is shown as written rather than replaced —
 * the API's sentence is the useful one.
 */
export function BuyPackageButton({
  slug,
  returnTo,
  className,
  children,
}: {
  slug: string;
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
      const res = await fetch("/api/conta/pacotes/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
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
          data.message ??
            "Não foi possível abrir o pagamento. Tente novamente.",
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
