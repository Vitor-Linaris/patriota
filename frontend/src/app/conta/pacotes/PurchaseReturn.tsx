"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** When to re-check, in ms after landing. Roughly a webhook's lifetime. */
const RETRIES = [1500, 3000, 6000];

/**
 * The banner shown when a reader comes back from Stripe Checkout.
 *
 * Same shape and the same discipline as CheckoutReturn on the
 * subscription page: `?sucesso=1` is never treated as proof of anything.
 * The browser is redirected the instant the card clears, while the webhook
 * that actually grants the articles arrives separately and usually a
 * moment later. Trusting the redirect would mean anyone who edited the URL
 * could hand themselves a pacote, and a reader whose webhook was slow
 * would be told they own something the paywall still refuses them.
 *
 * So the server decides — this only closes the gap, by re-rendering a few
 * times over the first seconds and then saying so honestly rather than
 * spinning for ever.
 */
export function PurchaseReturn({ found }: { found: boolean }) {
  const router = useRouter();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (found) return;
    const timers = RETRIES.map((ms) => setTimeout(() => router.refresh(), ms));
    const done = setTimeout(
      () => setWaited(true),
      RETRIES[RETRIES.length - 1]! + 1500,
    );
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [found, router]);

  if (found) {
    return (
      <p className="mb-5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] text-emerald-900">
        <strong>Obrigado.</strong> O pacote é seu e já pode ler os artigos.
      </p>
    );
  }

  return (
    <p className="mb-5 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-[14px] text-slate-700">
      {waited ? (
        <>
          <strong>Pagamento recebido.</strong> O acesso ainda não apareceu
          aqui — por vezes demora um pouco. Recarregue esta página dentro de
          minutos; se continuar assim, fale connosco.
        </>
      ) : (
        <>A confirmar o pagamento…</>
      )}
    </p>
  );
}
