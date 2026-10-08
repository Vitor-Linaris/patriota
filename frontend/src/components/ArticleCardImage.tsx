import { coverSrcSet, imageVariant } from "@/lib/images";

/**
 * The picture of an article in a list card — given room, because on news
 * the photo is what catches the eye.
 *
 * Phones: on top of the card, full width at 16:9 (the shape of the
 * Investigação cards). From `sm:` up: a column on one side of the card,
 * edge to edge and as tall as the card, its width set by `side` (e.g.
 * "sm:w-56 lg:w-72 sm:min-h-[176px]"). It used to be a 112×80 thumbnail
 * beside the text, which gave the text all the weight.
 *
 * The card around it must be `overflow-hidden`, with no padding of its
 * own (padding goes on the text block), so the photo takes the card's
 * rounded corners.
 *
 * With no photo there is nothing to show on a phone; from `sm:` up a
 * placeholder keeps the rows aligned.
 */
export function ArticleCardImage({
  url,
  side,
  className = "",
  placeholder = "slate",
  sizes = "(min-width: 1024px) 288px, (min-width: 640px) 240px, 100vw",
}: {
  url: string | null | undefined;
  /** Width (and min height) from `sm:` up — full Tailwind classes, sm:/lg:-prefixed. */
  side: string;
  /** Extra classes, e.g. ordering. */
  className?: string;
  placeholder?: "slate" | "brand";
  /** The width it is shown at, for the browser's pick from srcSet. */
  sizes?: string;
}) {
  if (!url) {
    return (
      <div
        aria-hidden
        className={`hidden shrink-0 sm:block sm:self-stretch ${side} ${className} ${
          placeholder === "brand"
            ? "bg-gradient-to-br from-patriota-medium/10 to-patriota-accent/15"
            : "bg-gradient-to-br from-slate-200 to-slate-300"
        }`}
      />
    );
  }
  return (
    <div
      className={`relative aspect-[16/9] w-full shrink-0 overflow-hidden sm:aspect-auto sm:self-stretch ${side} ${className}`}
    >
      {/* Absolute, so the photo fills whatever height the card has and
          never sets it: in normal flow a portrait photo stretched its
          card to the photo's own height (500px+ for one row). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageVariant(url, "medium") ?? url}
        srcSet={coverSrcSet(url)}
        sizes={sizes}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
      />
    </div>
  );
}
