import { SectionHeading } from "./SectionHeading";
import { listMostRead, listPublicArticles } from "@/lib/public-api";
import { NewsletterForm } from "./NewsletterForm";
import { AdSlot } from "@/components/ads/AdSlot";
import type { Ad } from "@/lib/ads";
import { SidebarTopList } from "./SidebarTopList";

function initialsOf(name: string | null): string {
  if (!name) return "—";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export async function Sidebar({
  ad,
  adBelowNewsletter,
}: {
  ad?: Ad | null;
  adBelowNewsletter?: Ad | null;
} = {}) {
  // Pre-fetch both lists server-side; the client widget just toggles
  // between them — no extra round-trip on tab change.
  const [mostRead, recent, opinion] = await Promise.all([
    listMostRead(4),
    listPublicArticles({ pageSize: 4 }).then((r) => r.items),
    listPublicArticles({ category: "opiniao", pageSize: 3 }),
  ]);

  return (
    <aside className="flex flex-col gap-8">
      <SidebarTopList recent={recent} mostRead={mostRead} />

      {/* Sidebar ad slot (homepage-sidebar, 300×250 IAB MPU). The
          AdSlot collapses to nothing when the admin hasn't configured
          a banner — no placeholder card. */}
      <AdSlot ad={ad} variant="none" />

      {/* Opinion */}
      {opinion.items.length > 0 && (
        <section>
          <SectionHeading>Opinião</SectionHeading>
          <ul className="mt-4 flex flex-col gap-3">
            {opinion.items.map((o) => (
              <li key={o.id}>
                <a
                  href={`/artigo/${o.slug}`}
                  className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-patriota-medium text-[12px] font-bold text-white">
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
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Newsletter */}
      <section className="rounded-xl bg-patriota-dark p-6 text-white shadow-md">
        <p className="text-[11px] font-bold uppercase tracking-wider text-patriota-accent">
          Newsletter
        </p>
        <h3 className="mt-2 text-[20px] font-black leading-snug">
          Receba as manchetes do dia
        </h3>
        <p className="mt-2 text-[13px] text-white/70">
          Curadoria editorial diária, sem spam. Cancelamento imediato.
        </p>
        <NewsletterForm />
      </section>

      {/* Sidebar ad slot (homepage-sidebar-bottom, 728×90 Leaderboard —
          AdSlot scales it down to the column's actual width). */}
      <AdSlot ad={adBelowNewsletter} variant="none" />
    </aside>
  );
}
