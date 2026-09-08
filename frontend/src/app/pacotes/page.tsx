import Link from "next/link";
import { notFound } from "next/navigation";
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
  title: "Pacotes exclusivos — O Patriota Notícias",
  description:
    "Investigações completas reunidas num só pagamento. Sem assinatura.",
};

export default async function PacotesPage() {
  if (!FEATURES.packages) notFound();
  const packages = await listPackages();

  return (
    <>
      <TopBar />
      <SiteHeader />
      <SecondaryNav />
      <main className="bg-white py-10">
        <Container>
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-patriota-accent">
              Pacotes exclusivos
            </p>
            <h1 className="mt-2 text-[32px] font-black leading-tight text-slate-900">
              Uma investigação completa, num só pagamento
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
              Sem assinatura e sem renovação: paga uma vez e os artigos do
              pacote ficam seus.
            </p>
          </header>

          {packages.length === 0 ? (
            <p className="mx-auto mt-10 max-w-lg rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center text-[14px] text-slate-500">
              Ainda não há pacotes à venda. Volte em breve.
            </p>
          ) : (
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/pacotes/${p.slug}`}
                    className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:shadow-lg"
                  >
                    {p.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageVariant(p.coverImageUrl, "medium") ?? undefined}
                        alt=""
                        className="aspect-[16/9] w-full object-cover"
                      />
                    ) : (
                      <span className="flex aspect-[16/9] w-full items-center justify-center bg-patriota-dark text-[28px] text-patriota-accent">
                        ◫
                      </span>
                    )}
                    <span className="flex flex-1 flex-col p-5">
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          {p._count.items} artigo(s)
                        </span>
                        {p.includedInSubscription && (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                            Incluído na assinatura
                          </span>
                        )}
                      </span>
                      <span className="mt-2 text-[18px] font-black leading-snug text-slate-900">
                        {p.name}
                      </span>
                      {p.description && (
                        <span className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-slate-600">
                          {p.description}
                        </span>
                      )}
                      <span className="mt-4 text-[20px] font-black text-slate-900">
                        {formatPrice(p.priceCents, p.currency)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
