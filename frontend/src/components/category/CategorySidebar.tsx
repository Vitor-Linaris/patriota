import Link from "next/link";
import { SectionMarker } from "./SectionMarker";
import { getCategories } from "@/lib/categories";
import { listPublicArticles } from "@/lib/public-api";
import { NewsletterForm } from "@/components/home/NewsletterForm";
import { AdSlot } from "@/components/ads/AdSlot";
import type { Ad } from "@/lib/ads";

interface CategorySidebarProps {
  currentSlug: string;
  newsletterTitle: string;
  ad?: Ad | null;
}

function initialsOf(name: string | null): string {
  if (!name) return "—";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export async function CategorySidebar({
  currentSlug,
  newsletterTitle,
  ad,
}: CategorySidebarProps) {
  const [cats, opinion] = await Promise.all([
    getCategories(),
    listPublicArticles({ category: "opiniao", pageSize: 2 }),
  ]);
  const others = cats.filter((c) => c.slug !== currentSlug).slice(0, 6);

  return (
    <aside className="flex flex-col gap-8">
      {/* Newsletter */}
      <section className="rounded-xl bg-patriota-dark p-6 text-white shadow-md">
        <p className="text-[11px] font-bold uppercase tracking-wider text-patriota-accent">
          Newsletter
        </p>
        <h3 className="mt-2 text-[20px] font-black leading-snug">
          {newsletterTitle}
        </h3>
        <p className="mt-2 text-[13px] text-white/70">
          Curadoria editorial diária, sem spam. Cancelamento imediato.
        </p>
        <NewsletterForm />
      </section>

      {/* Opinião */}
      {opinion.items.length > 0 && (
        <section>
          <SectionMarker title="Opinião" />
          <ul className="mt-4 flex flex-col gap-3">
            {opinion.items.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/artigo/${o.slug}`}
                  className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-patriota-pure text-[12px] font-bold text-patriota-accent">
                    {initialsOf(o.author.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-slate-900">
                      {o.author.name ?? "Editorial"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {o.category.name}
                    </p>
                    <h4 className="mt-2 text-[13px] font-bold leading-snug text-slate-900">
                      {o.title}
                    </h4>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sidebar ad slot (category-sidebar, 300×250 IAB MPU). */}
      <AdSlot ad={ad} variant="none" />

      {/* Outras Rubricas */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-[15px] font-bold text-slate-900">
            Outras Rubricas
          </h3>
        </header>
        <ul className="divide-y divide-slate-100">
          {others.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/categoria/${c.slug}`}
                className="flex items-center justify-between px-5 py-3 text-[14px] transition hover:bg-slate-50"
              >
                <span className="font-semibold text-slate-800">{c.label}</span>
                <span className="flex items-center gap-3 text-[12px] text-slate-500">
                  <span>
                    {c.articleCount} {c.articleCount === 1 ? "artigo" : "artigos"}
                  </span>
                  <span aria-hidden className="text-slate-400">
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
