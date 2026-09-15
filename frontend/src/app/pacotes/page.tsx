import Link from "next/link";
import { notFound } from "next/navigation";
import { FiArrowRight, FiBookOpen, FiCheck, FiRepeat } from "react-icons/fi";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { SiteFooter } from "@/components/home/SiteFooter";
import { FEATURES } from "@/lib/features";
import { formatPrice, listPackages } from "@/lib/packages";
import { imageVariant } from "@/lib/images";

/**
 * The storefront.
 *
 * STATIC, revalidated every five minutes. It carries no per-reader state
 * and no buy button — the "already bought this" answer lives on the
 * detail page, which is dynamic for exactly that reason. Keeping the
 * listing static means the most-linked page of this feature is cheap.
 */
export const revalidate = 300;

export const metadata = {
  title: "Artigos exclusivos — O Patriota Notícias",
  description:
    "Investigações completas reunidas num só pagamento. Sem assinatura.",
};

/**
 * What a buyer actually wants to know before reading any of the names.
 *
 * Three questions, answered above the grid: what am I getting, for how
 * long, and does this sign me up for anything. A once-off payment is
 * unusual enough on a news site that leaving it implicit costs sales —
 * "sem renovação" is the whole proposition, not a footnote.
 */
const PROMISES = [
  {
    icon: FiBookOpen,
    title: "Uma investigação inteira",
    body: "Os artigos de um tema reunidos, na ordem em que foram escritos para serem lidos.",
  },
  {
    icon: FiCheck,
    title: "Paga uma vez",
    body: "Sem mensalidade. O que compra fica seu, para ler quando quiser.",
  },
  {
    icon: FiRepeat,
    title: "Sem renovação",
    body: "Não há subscrição a correr por trás, nem cartão a ser cobrado outra vez.",
  },
];

export default async function PacotesPage() {
  if (!FEATURES.packages) notFound();
  const packages = await listPackages();

  return (
    <>
      <TopBar />
      <SiteHeader />
      <SecondaryNav />

      <main className="bg-[#f6f7fb]">
        {/*
          A dark band, where every other public page opens white.

          The change of ground is the message: the reader has stepped out
          of the newsroom and into the one place on this site that asks
          for money. Reusing the masthead's own dark navy keeps it inside
          the newspaper rather than looking like somebody else's shop.
        */}
        <section className="relative overflow-hidden bg-patriota-dark">
          {/*
            Texture instead of a flat fill: a soft accent glow off-centre
            and a faint rule grid, both purely decorative and both cheap
            (two gradients, no image, no request).
          */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-patriota-accent/10 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:56px_56px]"
          />

          <Container className="relative py-14 sm:py-20">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-patriota-accent/30 bg-patriota-accent/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-patriota-accent">
                <span aria-hidden>◫</span> Artigos exclusivos
              </p>
              <h1 className="mt-5 text-[34px] font-black leading-[1.08] tracking-tight text-white sm:text-[46px]">
                Uma investigação completa,
                <br className="hidden sm:block" />{" "}
                <span className="text-patriota-accent">num só pagamento</span>.
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/70 sm:text-[17px]">
                Trabalho de meses, reunido num dossiê. Paga uma vez, sem
                assinatura e sem renovação — e os artigos ficam seus.
              </p>
            </div>

            <ul className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-3">
              {PROMISES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3 border-t border-white/10 pt-4">
                  <Icon
                    aria-hidden
                    className="mt-0.5 h-[18px] w-[18px] shrink-0 text-patriota-accent"
                  />
                  <div>
                    <p className="text-[13px] font-bold text-white">{title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-white/55">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <Container className="py-12 sm:py-16">
          {packages.length === 0 ? (
            <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <span
                aria-hidden
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-patriota-dark text-[22px] text-patriota-accent"
              >
                ◫
              </span>
              <p className="mt-4 text-[16px] font-black text-slate-900">
                Ainda não há pacotes à venda
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
                Estamos a fechar o primeiro dossiê. Subscreva a newsletter e
                sabe dele antes de toda a gente.
              </p>
              <Link
                href="/"
                className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-patriota-dark px-5 text-[14px] font-bold text-white transition-colors hover:bg-patriota-medium"
              >
                Voltar às notícias <FiArrowRight aria-hidden />
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  À venda agora
                </h2>
                <p className="text-[13px] text-slate-400">
                  {packages.length}{" "}
                  {packages.length === 1 ? "pacote" : "pacotes"}
                </p>
              </div>

              <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {packages.map((p, i) => (
                  <li
                    key={p.slug}
                    /*
                     * One staggered reveal on load, 60ms apart, and
                     * nothing else moving on the page. `motion-safe:`
                     * is the whole reduced-motion story: with the
                     * preference set the animation is never applied, so
                     * the cards are simply there.
                     */
                    className="motion-safe:animate-[fadeUp_.5s_cubic-bezier(.16,1,.3,1)_both]"
                    style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                  >
                    <Link
                      href={`/pacotes/${p.slug}`}
                      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)] transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_12px_32px_-12px_rgba(30,44,77,.35)]"
                    >
                      <span className="relative block overflow-hidden">
                        {p.coverImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={
                              imageVariant(p.coverImageUrl, "medium") ??
                              undefined
                            }
                            alt=""
                            /* Declared so the grid does not jump while
                               the covers load. */
                            width={800}
                            height={450}
                            loading={i < 3 ? "eager" : "lazy"}
                            className="aspect-[16/9] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                          />
                        ) : (
                          <span className="flex aspect-[16/9] w-full items-center justify-center bg-patriota-dark text-[32px] text-patriota-accent">
                            ◫
                          </span>
                        )}
                        {/* Scrim so the price stays legible over any
                            photograph, dark or light. */}
                        <span
                          aria-hidden
                          className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent"
                        />
                        <span className="absolute bottom-3 left-3 rounded-lg bg-white/95 px-2.5 py-1 text-[15px] font-black tabular-nums text-patriota-dark shadow-sm">
                          {formatPrice(p.priceCents, p.currency)}
                        </span>
                        {p.includedInSubscription && (
                          <span className="absolute right-3 top-3 rounded-md bg-emerald-600/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                            Incluído na assinatura
                          </span>
                        )}
                      </span>

                      <span className="flex flex-1 flex-col p-5">
                        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
                          {p._count.items}{" "}
                          {p._count.items === 1 ? "artigo" : "artigos"}
                        </span>
                        <span className="mt-2 text-[19px] font-black leading-snug text-slate-900 transition-colors group-hover:text-patriota-medium">
                          {p.name}
                        </span>
                        {p.description && (
                          <span className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-slate-600">
                            {p.description}
                          </span>
                        )}
                        <span className="mt-auto flex items-center gap-1.5 pt-5 text-[13px] font-bold text-patriota-medium">
                          Ver o pacote
                          <FiArrowRight
                            aria-hidden
                            className="transition-transform duration-300 group-hover:translate-x-1"
                          />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
