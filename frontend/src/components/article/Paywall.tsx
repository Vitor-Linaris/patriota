import Link from "next/link";
import { SubscribeButton } from "./SubscribeButton";

/** The cheapest published pacote that contains this article, if any. */
export interface PackageOffer {
  slug: string;
  name: string;
  priceCents: number;
  currency: string;
  /** False means a subscription does NOT unlock this article. */
  includedInSubscription: boolean;
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/**
 * What a reader sees where the rest of an exclusive would have been.
 *
 * The text above this is genuinely all that was sent — the remainder is
 * not hidden, it never left the server. That is the difference between a
 * paywall and a blur, and it is why this component has no clever overlay:
 * there is nothing underneath it to cover up.
 *
 * The soft fade above is decoration on the last visible paragraph, not a
 * mask. It reads as "this continues" rather than as a wall dropped on top
 * of text the reader can nearly make out.
 *
 * Three shapes, decided by the pacote the article is sold in:
 *
 *   - no pacote — subscribe, as it has always been;
 *   - a pacote INCLUDED in the subscription — subscribing works, and so
 *     does buying just this dossiê. Subscription leads, because it is
 *     the better deal for anyone who reads more than one thing;
 *   - a pacote OUTSIDE the subscription — subscribing does NOT open this
 *     article. Offering it would take money for something that does not
 *     deliver what the reader came for, so the pacote is the only CTA
 *     and the page says plainly why.
 */
export function Paywall({
  signedIn,
  billingLive,
  returnTo,
  offer,
}: {
  signedIn: boolean;
  /** Whether this deployment can actually take a payment today. */
  billingLive: boolean;
  /** This article, to come back to after signing in. */
  returnTo: string;
  offer?: PackageOffer | null;
}) {
  const subscriptionOpens = !offer || offer.includedInSubscription;
  const price = offer ? formatPrice(offer.priceCents, offer.currency) : null;

  return (
    <section
      // Named for the JSON-LD on the article page, which points Google at
      // this selector to declare the piece as subscription content. If
      // this class changes, change it there too — otherwise serving cut
      // text to a crawler reads as cloaking.
      className="paywall-cut relative mt-2"
      aria-label="Conteúdo para assinantes"
    >
      <div
        aria-hidden
        className="pointer-events-none -mt-24 h-24 bg-gradient-to-b from-transparent to-white"
      />

      <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-6 py-8 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-patriota-pure">
          {offer ? "Artigo exclusivo" : "Conteúdo exclusivo"}
        </p>

        {subscriptionOpens ? (
          <>
            <h2 className="mt-2 text-[20px] font-black text-slate-900">
              Continue a ler com uma assinatura
            </h2>
            <p className="mx-auto mt-2 max-w-[460px] text-[14px] leading-relaxed text-slate-600">
              O jornalismo que lê aqui é feito por uma redacção que precisa
              de ser paga. Assine e leia este e todos os outros artigos
              exclusivos.
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-2 text-[20px] font-black text-slate-900">
              Este artigo faz parte de {offer!.name}
            </h2>
            {/*
              Said out loud, because it is the one case where the
              obvious action is the wrong one: this pacote is sold apart
              from the subscription, and a reader who subscribes to
              reach this article would pay and still be here.
            */}
            <p className="mx-auto mt-2 max-w-[460px] text-[14px] leading-relaxed text-slate-600">
              É um dossiê vendido à parte, não incluído na assinatura. Paga
              uma vez e os artigos ficam seus, sem renovação.
            </p>
          </>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {subscriptionOpens ? (
            <>
              {/* Straight to Stripe when billing is live. When it is not,
                  the button would only ever produce an error, so the page
                  falls back to the one that explains what is coming. */}
              {billingLive ? (
                <SubscribeButton
                  returnTo={returnTo}
                  className="rounded-[10px] bg-patriota-pure px-5 py-2.5 text-[14px] font-bold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  Assinar agora
                </SubscribeButton>
              ) : (
                <Link
                  href="/p/assinatura"
                  className="rounded-[10px] bg-patriota-pure px-5 py-2.5 text-[14px] font-bold text-white transition hover:brightness-110"
                >
                  Ver as assinaturas
                </Link>
              )}
              {/* The second way in, for somebody who wants this dossiê
                  and not a subscription. Secondary, because a
                  subscription is the better deal for anyone who reads
                  more than one thing. */}
              {offer && (
                <Link
                  href={`/pacotes/${offer.slug}`}
                  className="rounded-[10px] border border-slate-300 bg-white px-5 py-2.5 text-[14px] font-bold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                >
                  Comprar só este dossiê — {price}
                </Link>
              )}
            </>
          ) : (
            <Link
              href={`/pacotes/${offer!.slug}`}
              className="rounded-[10px] bg-patriota-pure px-5 py-2.5 text-[14px] font-bold text-white transition hover:brightness-110"
            >
              Ver o pacote — {price}
            </Link>
          )}

          {/* Only offered to someone who is not signed in. Telling a
              logged-in reader to "iniciar sessão" when their session is
              working fine reads as a broken site. */}
          {!signedIn && (
            <Link
              href={`/conta/entrar?next=${encodeURIComponent(returnTo)}`}
              className="text-[14px] font-semibold text-slate-600 underline-offset-4 transition hover:text-slate-900 hover:underline"
            >
              {subscriptionOpens ? "Já sou assinante" : "Já comprei"}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
