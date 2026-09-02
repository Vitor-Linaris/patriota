"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** When to re-check, in ms after landing. Roughly a webhook's lifetime. */
const RETRIES = [1500, 3000, 6000];

/**
 * The banner shown when a reader comes back from Stripe Checkout.
 *
 * The important thing here is what it does NOT do: it never treats
 * `?sucesso=1` as proof of anything. The browser is redirected the
 * instant the card clears, while the webhook that actually grants the
 * plan arrives separately and usually a moment later — occasionally much
 * later. Trusting the redirect would mean a reader who edited the URL
 * could hand themselves a subscription, and a reader whose webhook was
 * delayed would be told they are a subscriber while the paywall still
 * turns them away.
 *
 * So the server decides, and this only closes the gap: it re-renders the
 * page a few times over the first seconds, and if the plan still has not
 * landed it says so honestly rather than spinning for ever.
 */
export function CheckoutReturn({ active }: { active: boolean }) {
  const router = useRouter();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (active) return;
    const timers = RETRIES.map((ms) => setTimeout(() => router.refresh(), ms));
    const done = setTimeout(
      () => setWaited(true),
      RETRIES[RETRIES.length - 1]! + 1500,
    );
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [active, router]);

  if (active) {
    return (
      <p className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] text-emerald-900">
        <strong>Obrigado.</strong> A sua assinatura está activa e já pode ler
        os artigos exclusivos.
      </p>
    );
  }

  return (
    <p
      aria-live="polite"
      className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-[14px] text-slate-700"
    >
      {waited ? (
        <>
          <strong>Pagamento recebido.</strong> A confirmação do banco está a
          demorar mais do que o costume. Não é preciso pagar outra vez —
          actualize esta página daqui a um minuto. Se continuar assim,
          escreva-nos para{" "}
          <a
            href="mailto:redaccao@opatriota.pt"
            className="font-semibold text-patriota-medium hover:underline"
          >
            redaccao@opatriota.pt
          </a>
          .
        </>
      ) : (
        <>
          <strong>Pagamento recebido.</strong> Estamos a confirmar com o
          banco — leva alguns segundos.
        </>
      )}
    </p>
  );
}
