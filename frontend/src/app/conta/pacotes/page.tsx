import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import { readerApiFetch, requireReader } from "@/lib/reader-api";
import { formatPrice, type ReaderPackage } from "@/lib/packages";
import { imageVariant } from "@/lib/images";
import { ContaShell, EmptyState } from "../ContaShell";
import { PurchaseReturn } from "./PurchaseReturn";

export const metadata = {
  title: "Os meus pacotes — O Patriota Notícias",
  robots: { index: false, follow: false },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function PacotesPage({
  searchParams,
}: {
  searchParams: Promise<{ sucesso?: string }>;
}) {
  if (!FEATURES.readerArea || !FEATURES.packages) notFound();
  await requireReader("/conta/pacotes");
  const { sucesso } = await searchParams;

  // Called directly rather than through /api/conta/*: those BFF routes
  // exist for CLIENT components, which cannot read the httpOnly cookie.
  // A server component already has it.
  const res = await readerApiFetch("/reader/packages");
  const packages =
    res && res.ok ? ((await res.json()) as ReaderPackage[]) : [];

  return (
    <ContaShell
      active="/conta/pacotes"
      title="Os meus pacotes"
      subtitle={
        packages.length === 1
          ? "1 pacote comprado"
          : `${packages.length} pacotes comprados`
      }
    >
      {/* The webhook can land a second or two after Stripe redirects the
          reader back, so a purchase that is not on the list yet is normal
          for a moment rather than a failure. */}
      {sucesso === "1" && <PurchaseReturn found={packages.length > 0} />}

      {packages.length === 0 ? (
        <EmptyState
          glyph="◫"
          title="Ainda não comprou nenhum pacote"
          body="Os pacotes reúnem uma investigação completa num só pagamento, sem assinatura."
          cta={
            <Link
              href="/pacotes"
              className="inline-flex h-10 items-center rounded-md bg-patriota-accent px-4 text-[13px] font-bold text-patriota-ink"
            >
              Ver pacotes
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {packages.map((p) => (
            <section
              key={p.packageSlug}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              <div className="flex items-start gap-4 border-b border-slate-100 p-5">
                {p.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageVariant(p.coverImageUrl, "small") ?? undefined}
                    alt=""
                    className="h-16 w-24 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-[17px] font-black leading-snug text-slate-900">
                    <Link
                      href={`/pacotes/${p.packageSlug}`}
                      className="hover:underline"
                    >
                      {p.packageName}
                    </Link>
                  </h2>
                  <p className="mt-1 text-[12px] text-slate-500">
                    {p.source === "MANUAL"
                      ? "Oferta"
                      : formatPrice(p.amountCents, p.currency)}
                    {p.paidAt && ` · ${fmtDate(p.paidAt)}`} ·{" "}
                    {p.articles.length} artigo(s)
                  </p>
                </div>
              </div>

              <ul className="divide-y divide-slate-100">
                {p.articles.map((a) => (
                  <li key={a.slug} className="flex items-center gap-3 p-4">
                    {a.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageVariant(a.coverImageUrl, "small") ?? undefined}
                        alt=""
                        className="h-12 w-16 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="h-12 w-16 shrink-0 rounded bg-slate-100" />
                    )}
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/artigo/${a.slug}`}
                        className="block text-[14px] font-bold leading-snug text-slate-900 hover:underline"
                      >
                        {a.title}
                      </Link>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {a.categoryName}
                      </span>
                      {/* The promise made visible: an editor taking an
                          article out of the pacote never takes it from
                          somebody who paid for it. */}
                      {a.removedFromPackage && (
                        <span className="mt-1 block text-[11px] text-slate-400">
                          Já não faz parte do pacote; continua acessível
                          para si.
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </ContaShell>
  );
}
