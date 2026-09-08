import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { SiteFooter } from "@/components/home/SiteFooter";
import { BuyPackageButton } from "@/components/packages/BuyPackageButton";
import { FEATURES } from "@/lib/features";
import { formatPrice, getPackageBySlug } from "@/lib/packages";
import { imageVariant } from "@/lib/images";
import { readerApiFetch } from "@/lib/reader-api";

/**
 * DYNAMIC, and it has to be.
 *
 * The whole page is a promise about money and access: whether this
 * visitor already owns the pacote decides which call to action is shown,
 * and a cached "Comprar" served to somebody who already paid is the one
 * thing this page must never do. getPackageBySlug reads the reader cookie
 * and fetches no-store for the same reason.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pkg = await getPackageBySlug(slug);
  if (!pkg) return { title: "Pacote não encontrado — O Patriota Notícias" };
  return {
    title: `${pkg.name} — O Patriota Notícias`,
    description: pkg.description || undefined,
    openGraph: {
      title: pkg.name,
      description: pkg.description || undefined,
      images: pkg.coverImageUrl ? [pkg.coverImageUrl] : undefined,
      type: "website",
    },
  };
}

export default async function PacotePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!FEATURES.packages) notFound();
  const { slug } = await params;
  const pkg = await getPackageBySlug(slug);
  if (!pkg) notFound();

  // Only asked when it can change the answer: a pacote sold apart from
  // the subscription never shows "incluído na sua assinatura", so there
  // is nothing to look up.
  let subscriberCovered = false;
  if (pkg.includedInSubscription && !pkg.owned) {
    const me = await readerApiFetch("/reader/me");
    if (me && me.ok) {
      const data = (await me.json()) as { planActive?: boolean };
      subscriberCovered = Boolean(data.planActive);
    }
  }

  const returnTo = `/pacotes/${pkg.slug}`;

  return (
    <>
      <TopBar />
      <SiteHeader />
      <SecondaryNav />
      <main className="bg-white py-10">
        <Container>
          <nav className="text-[12px] text-slate-500">
            <Link href="/pacotes" className="hover:underline">
              Pacotes
            </Link>
            <span className="mx-1.5">›</span>
            <span className="text-slate-700">{pkg.name}</span>
          </nav>

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              {pkg.coverImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageVariant(pkg.coverImageUrl, "large") ?? undefined}
                  alt=""
                  className="aspect-[16/9] w-full rounded-xl object-cover"
                />
              )}
              <p className="mt-6 text-[11px] font-bold uppercase tracking-wider text-patriota-accent">
                Pacote exclusivo
              </p>
              <h1 className="mt-2 text-[30px] font-black leading-tight text-slate-900">
                {pkg.name}
              </h1>
              {pkg.description && (
                <p className="mt-3 text-[16px] leading-relaxed text-slate-700">
                  {pkg.description}
                </p>
              )}

              <h2 className="mt-8 border-b border-slate-200 pb-2 text-[13px] font-bold uppercase tracking-wide text-slate-700">
                O que está incluído ({pkg.articles.length})
              </h2>
              <ul className="mt-4 flex flex-col gap-4">
                {pkg.articles.map((a, i) => (
                  <li key={a.slug} className="flex gap-4">
                    <span className="w-6 shrink-0 text-[13px] font-black text-slate-300">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {a.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageVariant(a.coverImageUrl, "small") ?? undefined}
                        alt=""
                        className="h-16 w-24 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="h-16 w-24 shrink-0 rounded-lg bg-slate-100" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {a.category.name}
                      </span>
                      {/* A link only when they can actually read it.
                          Sending somebody who has not paid to a paywall
                          they just declined to buy is a dead end. */}
                      {pkg.owned || subscriberCovered ? (
                        <Link
                          href={`/artigo/${a.slug}`}
                          className="mt-0.5 block text-[15px] font-bold leading-snug text-slate-900 hover:underline"
                        >
                          {a.title}
                        </Link>
                      ) : (
                        <span className="mt-0.5 block text-[15px] font-bold leading-snug text-slate-900">
                          {a.title}
                        </span>
                      )}
                      <span className="mt-1 block line-clamp-2 text-[13px] text-slate-600">
                        {a.summary}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* ── the CTA ─────────────────────────────────────────── */}
            <aside className="lg:col-span-5">
              <div className="sticky top-6 rounded-xl border border-slate-200 bg-patriota-dark p-6 text-white shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wider text-patriota-accent">
                  {pkg.owned ? "Já é seu" : "Compra única"}
                </p>
                <p className="mt-2 text-[34px] font-black leading-none">
                  {formatPrice(pkg.priceCents, pkg.currency)}
                </p>
                <p className="mt-2 text-[13px] text-white/70">
                  Pagamento único, sem assinatura e sem renovação.{" "}
                  {pkg.articles.length} artigo(s), seus para sempre.
                </p>

                <div className="mt-5">
                  {pkg.owned ? (
                    <Link
                      href="/conta/pacotes"
                      className="flex h-11 w-full items-center justify-center rounded-md border border-patriota-accent bg-transparent text-[14px] font-bold text-patriota-accent"
                    >
                      Ver nos meus pacotes
                    </Link>
                  ) : subscriberCovered ? (
                    <p className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-[13px] text-emerald-200">
                      <strong>Incluído na sua assinatura.</strong> Pode ler
                      estes artigos sem comprar o pacote.
                    </p>
                  ) : FEATURES.billing && pkg.purchasable ? (
                    <BuyPackageButton
                      slug={pkg.slug}
                      returnTo={returnTo}
                      className="flex h-11 w-full items-center justify-center rounded-md bg-patriota-accent text-[14px] font-bold text-patriota-ink transition hover:brightness-105 disabled:opacity-60"
                    >
                      Comprar pacote
                    </BuyPackageButton>
                  ) : (
                    <Link
                      href="/p/assinatura"
                      className="flex h-11 w-full items-center justify-center rounded-md bg-patriota-accent text-[14px] font-bold text-patriota-ink"
                    >
                      Saber mais
                    </Link>
                  )}
                </div>

                {pkg.includedInSubscription && !pkg.owned && (
                  <p className="mt-4 border-t border-white/10 pt-4 text-[12px] text-white/60">
                    Este pacote também está incluído na assinatura.{" "}
                    <Link
                      href="/p/assinatura"
                      className="font-semibold text-patriota-accent hover:underline"
                    >
                      Ver a assinatura
                    </Link>
                  </p>
                )}
              </div>
            </aside>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
