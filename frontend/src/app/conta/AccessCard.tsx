import Link from "next/link";
import { formatPrice, type PackageCard } from "@/lib/packages";

/**
 * "Como está a ler" — the access block at the top of the reader dashboard.
 *
 * The chip beside the reader's name ("Conta gratuita" / "Assinante") is
 * the only thing on this page that has ever mentioned paying, and a chip
 * is easy to look past: somebody who never notices it never finds out
 * there is anything to buy. This says it in full, above the counters, and
 * — the point of it — offers BOTH ways in rather than only the
 * subscription. A reader who will not commit to a monthly charge may well
 * pay once for a dossier, and until now the dashboard never asked.
 *
 * Three states, and each is a different conversation:
 *   - subscriber: nothing to sell, so it confirms and gets out of the way
 *   - owns pacotes: what they have, and where the rest is
 *   - neither: the two offers, side by side, with a real pacote named and
 *     priced instead of an abstract "ver pacotes"
 */
export function AccessCard({
  planActive,
  ownedPackages,
  packages,
  billingLive,
}: {
  planActive: boolean;
  /** Pacotes this reader has paid for. */
  ownedPackages: number;
  /** What is on sale right now. Empty when nothing is, or the flag is off. */
  packages: PackageCard[];
  /** Whether this deployment can actually take a payment today. */
  billingLive: boolean;
}) {
  // The cheapest is the one worth naming: it is the smallest thing a
  // reader has to agree to, and the honest floor of "from X".
  const cheapest = [...packages].sort((a, b) => a.priceCents - b.priceCents)[0];

  // ── subscriber ───────────────────────────────────────────────────
  if (planActive) {
    return (
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-amber-200 bg-amber-50 px-5 py-4">
        <div>
          <p className="text-[14px] font-bold text-amber-900">
            É assinante — tem acesso aos artigos exclusivos
          </p>
          {packages.length > 0 && (
            <p className="mt-1 text-[13px] text-amber-800">
              Os pacotes reúnem uma investigação completa; alguns são
              vendidos à parte da assinatura.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {packages.length > 0 && (
            <Link
              href="/pacotes"
              className="rounded-[8px] border border-amber-300 bg-white px-4 py-2 text-[13px] font-bold text-amber-900 transition hover:border-amber-400"
            >
              Ver pacotes
            </Link>
          )}
          <Link
            href="/conta/assinatura"
            className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-amber-900 underline transition hover:no-underline"
          >
            Gerir assinatura
          </Link>
        </div>
      </div>
    );
  }

  // ── owns at least one pacote ─────────────────────────────────────
  if (ownedPackages > 0) {
    return (
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-slate-200 bg-white px-5 py-4">
        <div>
          <p className="text-[14px] font-bold text-slate-900">
            {ownedPackages === 1
              ? "Tem 1 pacote comprado"
              : `Tem ${ownedPackages} pacotes comprados`}
          </p>
          <p className="mt-1 text-[13px] text-slate-500">
            Os artigos que comprou são seus para sempre. Uma assinatura dá
            acesso a tudo o que é exclusivo, sem comprar peça a peça.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/conta/pacotes"
            className="rounded-[8px] bg-patriota-pure px-4 py-2 text-[13px] font-bold text-white transition hover:opacity-90"
          >
            Os meus pacotes
          </Link>
          <Link
            href="/conta/assinatura"
            className="rounded-[8px] border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-400"
          >
            Ver assinatura
          </Link>
        </div>
      </div>
    );
  }

  // ── free account, owns nothing ───────────────────────────────────
  return (
    <div className="mt-6 overflow-hidden rounded-[12px] border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-[14px] font-bold text-slate-900">
          Está a ler com uma conta gratuita
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          Os trabalhos exclusivos são pagos. Há duas formas de os ler — e
          nenhuma delas obriga à outra.
        </p>
      </div>

      <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
        <div className="flex flex-col bg-white p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-patriota-pure">
            Assinatura
          </p>
          <p className="mt-1.5 text-[14px] font-bold text-slate-900">
            Tudo o que é exclusivo
          </p>
          <p className="mt-1 flex-1 text-[13px] leading-relaxed text-slate-500">
            Acesso contínuo a todos os trabalhos exclusivos enquanto for
            assinante.
          </p>
          <Link
            href="/conta/assinatura"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-[8px] bg-patriota-pure px-4 text-[13px] font-bold text-white transition hover:opacity-90"
          >
            Ver a assinatura
          </Link>
        </div>

        <div className="flex flex-col bg-white p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Pacote
          </p>
          <p className="mt-1.5 text-[14px] font-bold text-slate-900">
            Uma investigação, um pagamento
          </p>
          <p className="mt-1 flex-1 text-[13px] leading-relaxed text-slate-500">
            {cheapest ? (
              <>
                Paga uma vez e os artigos ficam seus, sem assinatura e sem
                renovação. A partir de{" "}
                <strong className="text-slate-900">
                  {formatPrice(cheapest.priceCents, cheapest.currency)}
                </strong>
                .
              </>
            ) : (
              <>
                Paga uma vez e os artigos ficam seus, sem assinatura e sem
                renovação. Ainda não há pacotes à venda.
              </>
            )}
          </p>
          {/* No buy button here on purpose: buying needs a pacote chosen,
              and that choice belongs on the pacote's own page, where the
              cover, the article list and the price are. This only has to
              get them there. */}
          <Link
            href="/pacotes"
            aria-disabled={packages.length === 0}
            className={`mt-4 inline-flex h-10 items-center justify-center rounded-[8px] border px-4 text-[13px] font-bold transition ${
              packages.length === 0
                ? "pointer-events-none border-slate-200 text-slate-400"
                : "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
            }`}
          >
            {packages.length === 0
              ? "Brevemente"
              : packages.length === 1
                ? "Ver o pacote"
                : `Ver os ${packages.length} pacotes`}
          </Link>
        </div>
      </div>

      {!billingLive && (
        <p className="border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-[12px] text-slate-500">
          Os pagamentos ainda não estão activos neste site.
        </p>
      )}
    </div>
  );
}
