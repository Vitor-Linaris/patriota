import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import { readerApiFetch, requireReader, type ReaderMe } from "@/lib/reader-api";
import { ContaShell } from "../ContaShell";
import { SubscribeButton } from "@/components/article/SubscribeButton";
import { ManageBillingButton } from "./ManageBillingButton";
import { CheckoutReturn } from "./CheckoutReturn";

export const metadata = {
  title: "A minha assinatura — O Patriota Notícias",
  robots: { index: false, follow: false },
};

const LONG_DATE = new Intl.DateTimeFormat("pt-PT", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * What Stripe's status words mean to somebody who is not a developer.
 *
 * `past_due` is the one worth getting right: the reader still has
 * access, so the message has to say what went wrong and what to do,
 * not just report a state.
 */
const STATUS_NOTE: Record<string, string> = {
  active: "",
  trialing: "Está em período experimental.",
  past_due:
    "O último pagamento não passou. Continua a ler, mas actualize o cartão para não perder o acesso.",
  incomplete: "O pagamento ainda não foi concluído.",
  unpaid: "Há pagamentos por regularizar.",
  canceled: "A assinatura foi cancelada.",
  oferecida: "",
};

export default async function AssinaturaPage({
  searchParams,
}: {
  searchParams: Promise<{ sucesso?: string }>;
}) {
  const { sucesso } = await searchParams;
  if (!FEATURES.readerArea) notFound();
  await requireReader("/conta/assinatura");

  const res = await readerApiFetch("/reader/me");
  if (!res || !res.ok) notFound();
  const me = (await res.json()) as ReaderMe;

  const ends = me.planRenewsAt ? new Date(me.planRenewsAt) : null;
  const gifted = me.planSource === "MANUAL";
  const note = me.planStatus ? (STATUS_NOTE[me.planStatus] ?? "") : "";

  return (
    <ContaShell
      active="/conta/assinatura"
      title="A minha assinatura"
      subtitle={
        me.planActive
          ? "Tem acesso aos artigos exclusivos."
          : "Está na conta gratuita."
      }
    >
      <div className="flex flex-col gap-5">
        {sucesso === "1" && <CheckoutReturn active={me.planActive} />}

        {/* The state, said plainly and first. `planActive` and not
            `plan`: a reader whose subscription ended last week comes to
            this page precisely to find out why an article is closed to
            them, and a badge saying "Assinante" would be the site
            arguing with them. */}
        <section
          className={`rounded-[14px] border p-6 ${
            me.planActive
              ? "border-amber-200 bg-amber-50"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Plano actual
          </p>
          <h2 className="mt-1 text-[24px] font-black text-slate-900">
            {me.planActive ? "Assinante" : "Gratuito"}
            {me.planActive && gifted && (
              <span className="ml-2 align-middle text-[12px] font-bold uppercase tracking-wide text-amber-700">
                oferecida
              </span>
            )}
          </h2>

          {me.planActive ? (
            <p className="mt-2 text-[15px] leading-relaxed text-slate-700">
              {ends ? (
                <>
                  {gifted ? "Termina" : "Renova"} a{" "}
                  <strong>{LONG_DATE.format(ends)}</strong>.
                </>
              ) : (
                "Sem data de fim."
              )}
            </p>
          ) : (
            <p className="mt-2 text-[15px] leading-relaxed text-slate-700">
              Pode ler todo o jornal excepto os artigos marcados como
              exclusivos, guardar notícias, seguir categorias e comentar.
            </p>
          )}

          {note && (
            <p className="mt-3 rounded-[8px] border border-amber-300 bg-white px-3 py-2 text-[13px] text-amber-900">
              {note}
            </p>
          )}

          {/* Shown only when the row still claims a plan whose date has
              passed. Without it the page would say "Gratuito" to
              somebody who remembers paying, and explain nothing. */}
          {!me.planActive && me.plan === "PREMIUM" && (
            <p className="mt-3 rounded-[8px] border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-700">
              A sua assinatura anterior terminou
              {ends ? ` a ${LONG_DATE.format(ends)}` : ""}.
            </p>
          )}
        </section>

        {/* Actions. What is on offer depends on how they got here: a
            gifted subscription has no card behind it and therefore
            nothing to manage, which is why the portal is tied to
            hasBilling rather than to being a subscriber. */}
        <section className="rounded-[14px] border border-slate-200 p-6">
          <h3 className="text-[15px] font-black text-slate-900">
            {me.planActive ? "Gerir" : "Assinar"}
          </h3>

          {me.planActive ? (
            <>
              {me.hasBilling ? (
                <>
                  <p className="mt-1 text-[14px] leading-relaxed text-slate-600">
                    Cancelar, trocar de cartão ou transferir faturas — tudo
                    nas páginas seguras do Stripe. Se cancelar, continua a
                    ler até ao fim do período já pago.
                  </p>
                  <div className="mt-4">
                    <ManageBillingButton className="rounded-[10px] bg-patriota-pure px-5 py-2.5 text-[14px] font-bold text-white transition hover:brightness-110 disabled:opacity-60">
                      Gerir assinatura
                    </ManageBillingButton>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-[14px] leading-relaxed text-slate-600">
                  Esta assinatura foi-lhe oferecida pela redacção, por isso
                  não há nada a pagar nem a gerir. Se tiver dúvidas, fale
                  connosco em{" "}
                  <a
                    href="mailto:redaccao@opatriota.pt"
                    className="font-semibold text-patriota-medium hover:underline"
                  >
                    redaccao@opatriota.pt
                  </a>
                  .
                </p>
              )}
            </>
          ) : FEATURES.billing ? (
            <>
              <p className="mt-1 text-[14px] leading-relaxed text-slate-600">
                Uma assinatura dá-lhe os artigos exclusivos e sustenta o
                trabalho da redacção. Pode cancelar quando quiser.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <SubscribeButton
                  returnTo="/conta/assinatura"
                  className="rounded-[10px] bg-patriota-pure px-5 py-2.5 text-[14px] font-bold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  Assinar
                </SubscribeButton>
                {/* A returning subscriber has a customer record even with
                    no live plan — their invoices are still theirs. */}
                {me.hasBilling && (
                  <ManageBillingButton className="text-[14px] font-semibold text-slate-600 underline-offset-4 transition hover:text-slate-900 hover:underline">
                    Ver faturas anteriores
                  </ManageBillingButton>
                )}
              </div>
            </>
          ) : (
            <p className="mt-1 text-[14px] leading-relaxed text-slate-600">
              A assinatura paga ainda não está aberta.{" "}
              <Link
                href="/p/assinatura"
                className="font-semibold text-patriota-medium hover:underline"
              >
                Saiba o que vem aí
              </Link>
              .
            </p>
          )}
        </section>
      </div>
    </ContaShell>
  );
}
