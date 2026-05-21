import Link from "next/link";
import {
  timeAgo,
  type ArticleSummary,
  type ArticleDetail,
} from "@/lib/public-api";
import { imageVariant } from "@/lib/images";

const CATEGORY_COLOR: Record<string, string> = {
  Política: "bg-red-600",
  Economia: "bg-emerald-600",
  Sociedade: "bg-blue-600",
  Investigação: "bg-amber-600",
  Mundo: "bg-purple-600",
  Cultura: "bg-amber-700",
  Tecnologia: "bg-cyan-600",
  Saúde: "bg-green-600",
  Desporto: "bg-red-700",
  Investigaçao: "bg-amber-600",
};

interface Props {
  featured: ArticleDetail | null;
  side: ArticleSummary[];
}

function initialsOf(name: string | null | undefined): string {
  if (!name) return "??";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function HeroGrid({ featured, side }: Props) {
  return (
    <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Big hero card. The whole card is wrapped in a <Link> so the
          entire area is clickable; the image zooms (scale-105) and a
          deeper gradient overlay reveals on hover for tactile feedback
          without shifting any text layout. */}
      <Link
        href={featured ? `/artigo/${featured.slug}` : "#"}
        className="group relative col-span-1 overflow-hidden rounded-xl bg-patriota-dark text-white shadow-sm transition-shadow duration-500 hover:shadow-xl lg:col-span-8"
      >
        {featured?.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={
              imageVariant(featured.coverImageUrl, "large") ??
              featured.coverImageUrl
            }
            alt={featured.title}
            className="aspect-[16/9] w-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div
            className="aspect-[16/9] w-full bg-gradient-to-br from-slate-700 via-patriota-medium to-patriota-dark"
            aria-hidden
          />
        )}
        {/* Base gradient + extra hover layer for subtle darkening. */}
        <div className="absolute inset-0 bg-gradient-to-t from-patriota-dark via-patriota-dark/85 to-transparent" />
        <div className="absolute inset-0 bg-patriota-dark/0 transition-colors duration-500 group-hover:bg-patriota-dark/10" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6 lg:p-8">
          <div className="flex items-center gap-3 text-[12px] text-white/80">
            <span
              className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${CATEGORY_COLOR[featured?.category.name ?? ""] ?? "bg-slate-600"}`}
            >
              {featured?.category.name ?? "Geral"}
            </span>
            <span>{timeAgo(featured?.publishedAt ?? null)}</span>
            <span aria-hidden>·</span>
            <span>{featured?.readMinutes ?? 4} min leitura</span>
          </div>
          <h1 className="text-2xl font-black leading-tight transition-colors duration-300 group-hover:text-patriota-accent lg:text-[30px] lg:leading-[36px]">
            {featured?.title ??
              "Nenhum artigo publicado ainda. Crie um no painel admin."}
          </h1>
          {featured?.summary && (
            <p className="max-w-2xl text-[14px] leading-relaxed text-white/75">
              {featured.summary}
            </p>
          )}
          {featured?.author?.name && (
            <div className="mt-2 flex items-center gap-2 text-[13px] text-white/70">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-patriota-accent text-[11px] font-bold text-patriota-ink">
                {initialsOf(featured.author.name)}
              </span>
              <span>{featured.author.name}</span>
            </div>
          )}
        </div>
      </Link>

      {/* Side stack of 3 small cards. Each card lifts + tilts a touch
          on hover; the thumbnail zooms, the title shifts to the brand
          colour, and a small arrow slides in to hint "click me". */}
      <div className="col-span-1 flex flex-col gap-4 lg:col-span-4">
        {side.map((card) => (
          <Link
            key={card.id}
            href={`/artigo/${card.slug}`}
            className="group flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-patriota-medium hover:shadow-lg"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white ${CATEGORY_COLOR[card.category.name] ?? "bg-slate-600"}`}
                >
                  {card.category.name}
                </span>
                <span aria-hidden>·</span>
                <span>{timeAgo(card.publishedAt)}</span>
              </div>
              <h3 className="text-[14px] font-bold leading-snug text-slate-900 transition-colors duration-200 group-hover:text-patriota-medium">
                {card.title}
                <span
                  aria-hidden
                  className="ml-1 inline-block translate-x-0 text-patriota-accent opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100"
                >
                  →
                </span>
              </h3>
            </div>
            {card.coverImageUrl ? (
              <div className="hidden h-16 w-20 shrink-0 overflow-hidden rounded-md sm:block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    imageVariant(card.coverImageUrl, "small") ??
                    card.coverImageUrl
                  }
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                />
              </div>
            ) : (
              <div className="hidden h-16 w-20 shrink-0 rounded-md bg-gradient-to-br from-slate-200 to-slate-300 sm:block" />
            )}
          </Link>
        ))}
        {side.length === 0 && (
          <p className="text-sm text-slate-400">
            Sem artigos para mostrar — adicione no painel.
          </p>
        )}
      </div>
    </section>
  );
}

export { CATEGORY_COLOR };
