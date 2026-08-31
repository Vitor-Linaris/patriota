import Link from "next/link";

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
 */
export function Paywall({ signedIn }: { signedIn: boolean }) {
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
          Conteúdo exclusivo
        </p>
        <h2 className="mt-2 text-[20px] font-black text-slate-900">
          Continue a ler com uma assinatura
        </h2>
        <p className="mx-auto mt-2 max-w-[460px] text-[14px] leading-relaxed text-slate-600">
          O jornalismo que lê aqui é feito por uma redacção que precisa de
          ser paga. Assine e leia este e todos os outros artigos exclusivos.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/p/assinatura"
            className="rounded-[10px] bg-patriota-pure px-5 py-2.5 text-[14px] font-bold text-white transition hover:brightness-110"
          >
            Ver as assinaturas
          </Link>
          {/* Only offered to someone who is not signed in. Telling a
              logged-in reader to "iniciar sessão" when their session is
              working fine reads as a broken site. */}
          {!signedIn && (
            <Link
              href="/conta/entrar"
              className="text-[14px] font-semibold text-slate-600 underline-offset-4 transition hover:text-slate-900 hover:underline"
            >
              Já sou assinante
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
