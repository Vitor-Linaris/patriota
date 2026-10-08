import Link from "next/link";
import {
  timeAgo,
  type ArticleSummary,
} from "@/lib/public-api";
import { imageVariant } from "@/lib/images";
import { CategoryBadge } from "../CategoryBadge";
import { ArticleCardImage } from "../ArticleCardImage";

interface Props {
  featured: ArticleSummary | null;
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
          {/* Cut with "…" so a 200-character title or a long summary
              cannot climb out of the top of the photo (on lg+ the text
              sits over it, anchored to the bottom). */}
          <h1 className="line-clamp-3 wrap-anywhere text-xl font-black leading-tight transition-colors duration-300 group-hover:text-patriota-accent sm:text-2xl lg:text-[30px] lg:leading-[36px]">
            {featured?.title ??
              "Nenhum artigo publicado ainda. Crie um no painel admin."}
          </h1>
          {featured?.summary && (
            <p className="line-clamp-3 max-w-2xl wrap-anywhere text-[13px] leading-relaxed text-white/75 sm:text-[14px] lg:line-clamp-2">
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
          link and the colour shift is enough cue.

          On lg+ the stack is as tall as the big card beside it (the
          grid row stretches it) and the cards share that height
          (flex-1), so the column ends where the hero ends instead of
          leaving a gap under the third card. The gap between cards
          stays fixed; only the cards grow or shrink with the hero.

          The photo is a column down the left of each card, as tall as
          the card (see ArticleCardImage) — it was an 80×64 thumbnail.
          lg:min-h-0 so three cards can always shrink to the hero's
          height; below lg they stack under it and keep a minimum. */}
      <div className="col-span-1 flex flex-col gap-4 lg:col-span-4">
        {side.slice(0, 3).map((card) => (
          <Link
            key={card.id}
            href={`/artigo/${card.slug}`}
            // Phones: photo on top, text below.
            className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:border-patriota-medium hover:shadow-[0_6px_20px_-8px_rgba(15,44,107,0.18)] sm:flex-row lg:flex-1"
          >
            <ArticleCardImage
              url={card.coverImageUrl}
              side="sm:w-56 sm:min-h-[140px] lg:min-h-0 lg:w-40 xl:w-44"
              sizes="(min-width: 1024px) 176px, (min-width: 640px) 224px, 100vw"
            />
            <div className="flex min-w-0 flex-1 flex-col justify-center p-4">
              {/* Same weight as before on desktop; bigger next to a
                  full-width photo on a phone. */}
              <div className="mb-2 flex min-w-0 items-center gap-2 whitespace-nowrap text-[11px] text-slate-500">
                <CategoryBadge
                  name={card.category.name}
                  color={card.category.color}
                  size="sm"
                />
                <span aria-hidden>·</span>
                <span>{timeAgo(card.publishedAt)}</span>
              </div>
              {/* These cards share the hero's height, which at 1024px
                  leaves about 100px each — room for two lines, not three.
                  From xl up the hero is tall enough for three. */}
              <h3 className="line-clamp-3 wrap-anywhere text-[17px] font-bold leading-snug text-slate-900 transition-colors duration-200 group-hover:text-patriota-medium lg:line-clamp-2 lg:text-[15px] xl:line-clamp-3">
                {card.title}
              </h3>
            </div>
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
