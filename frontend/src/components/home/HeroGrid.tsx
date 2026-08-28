import Link from "next/link";
import {
  timeAgo,
  type ArticleSummary,
  type ArticleDetail,
} from "@/lib/public-api";
import { imageVariant } from "@/lib/images";
import { CategoryBadge } from "../CategoryBadge";

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
        className="group relative col-span-1 overflow-hidden rounded-xl bg-patriota-dark text-white shadow-sm transition-shadow duration-500 hover:shadow-[0_12px_32px_-12px_rgba(15,44,107,0.25)] lg:col-span-8"
      >
        {/* Image / placeholder. The wrapper is overflow-hidden so the
            hover zoom doesn't leak past the card. */}
        <div className="overflow-hidden">
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
        </div>

        {/* Gradient overlays — only on desktop where the text sits on
            top of the image. On mobile the text flows below the
            image instead (see the layout-mode switch on the text
            container below) so we don't need the gradient. */}
        <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-t from-patriota-dark via-patriota-dark/85 to-transparent lg:block" />
        <div className="pointer-events-none absolute inset-0 hidden bg-patriota-dark/0 transition-colors duration-500 group-hover:bg-patriota-dark/10 lg:block" />

        {/* Text — relative on mobile (flows below the image, no
            cropping), absolute on lg+ (overlays the gradient).
            Switching layout mode rather than trying to cram the
            absolute overlay into a 16/9 mobile viewport is what
            stops the title / summary / author from being cut off
            on phones. */}
        <div className="relative flex flex-col gap-3 p-5 sm:p-6 lg:absolute lg:inset-x-0 lg:bottom-0 lg:p-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/80">
            <CategoryBadge
              name={featured?.category.name ?? "Geral"}
              color={featured?.category.color}
            />
            <span>{timeAgo(featured?.publishedAt ?? null)}</span>
            <span aria-hidden>·</span>
            <span>{featured?.readMinutes ?? 4} min leitura</span>
          </div>
          <h1 className="text-xl font-black leading-tight transition-colors duration-300 group-hover:text-patriota-accent sm:text-2xl lg:text-[30px] lg:leading-[36px]">
            {featured?.title ??
              "Nenhum artigo publicado ainda. Crie um no painel admin."}
          </h1>
          {featured?.summary && (
            <p className="max-w-2xl text-[13px] leading-relaxed text-white/75 sm:text-[14px]">
              {featured.summary}
            </p>
          )}
          {featured?.author?.name && (
            <div className="mt-1 flex items-center gap-2 text-[13px] text-white/70">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-patriota-accent text-[11px] font-bold text-patriota-ink">
                {initialsOf(featured.author.name)}
              </span>
              <span>{featured.author.name}</span>
            </div>
          )}
        </div>
      </Link>

      {/* Side stack of up to 3 small cards. Card lifts a notch on
          hover with a soft shadow; thumbnail zooms; title shifts to
          brand colour. No arrow indicator — the whole row is the
          link and the colour shift is enough cue. */}
      <div className="col-span-1 flex flex-col gap-4 lg:col-span-4">
        {side.slice(0, 3).map((card) => (
          <Link
            key={card.id}
            href={`/artigo/${card.slug}`}
            className="group flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-patriota-medium hover:shadow-[0_6px_20px_-8px_rgba(15,44,107,0.18)]"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                <CategoryBadge
                  name={card.category.name}
                  color={card.category.color}
                  size="sm"
                />
                <span aria-hidden>·</span>
                <span>{timeAgo(card.publishedAt)}</span>
              </div>
              <h3 className="text-[14px] font-bold leading-snug text-slate-900 transition-colors duration-200 group-hover:text-patriota-medium">
                {card.title}
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
