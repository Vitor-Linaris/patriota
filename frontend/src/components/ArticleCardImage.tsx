import { coverSrcSet, imageVariant } from "@/lib/images";

/**
 * The picture of an article in a list card.
 *
 * On phones it sits on top of the card, full width at 16:9 — the same
 * shape as the Investigação cards — because on news the photo is what
 * catches the eye, and it used to be hidden below `sm:` altogether. From
 * `sm:` up it goes back to being a thumbnail beside the text, sized by
 * `thumb` (e.g. "sm:h-20 sm:w-28").
 *
 * The card around it must be `overflow-hidden` with no padding on phones
 * (padding moves to the text block), so the photo runs edge to edge and
 * takes the card's rounded corners.
 *
 * With no photo there is nothing to show on a phone; from `sm:` up the
 * usual placeholder keeps the rows aligned.
 */
export function ArticleCardImage({
  url,
  thumb,
  className = "",
  placeholder = "slate",
}: {
  url: string | null | undefined;
  /** Thumbnail size from `sm:` up — full Tailwind classes, sm:-prefixed. */
  thumb: string;
  /** Extra classes, e.g. ordering when the thumbnail sits to the right. */
  className?: string;
  placeholder?: "slate" | "brand";
}) {
  if (!url) {
    return (
      <div
        aria-hidden
        className={`hidden shrink-0 rounded-md sm:block ${thumb} ${className} ${
          placeholder === "brand"
            ? "bg-gradient-to-br from-patriota-medium/10 to-patriota-accent/15"
            : "bg-gradient-to-br from-slate-200 to-slate-300"
        }`}
      />
    );
  }
  return (
    <div
      className={`aspect-[16/9] w-full shrink-0 overflow-hidden sm:aspect-auto sm:rounded-md ${thumb} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageVariant(url, "medium") ?? url}
        srcSet={coverSrcSet(url)}
        sizes="(min-width: 640px) 160px, 100vw"
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
      />
    </div>
  );
}
