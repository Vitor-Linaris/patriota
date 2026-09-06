import { Container } from "../Container";
import { parseAdSize, type Ad } from "@/lib/ads";
import { ScriptedHtml } from "./ScriptedHtml";

/**
 * Public-facing ad slot. Renders an image-with-link, an HTML/iframe
 * embed, or NOTHING — depending on what the admin configured at
 * /admin/publicidade and what the backend returned for this id.
 *
 * Sizing rules:
 *   • The slot is capped at the ad's intrinsic width (e.g. 970px for
 *     a leaderboard). On smaller screens it scales DOWN to the
 *     parent container's width — never grows past the cap.
 *   • For images we use `aspect-ratio: w/h` so the height tracks the
 *     width as the slot shrinks, preventing letterboxing.
 *   • HTML embeds get the same max-width but no aspect-ratio (the
 *     embed itself decides its own height).
 *
 * Empty / disabled / missing-id slots render `null` so the layout
 * collapses naturally — no "Publicidade" label, no placeholder.
 */
export interface AdSlotProps {
  ad: Ad | null | undefined;
  /** Optional wrapper around the slot. The default "section" gives
   *  the slot vertical breathing room and centers it. Set to "none"
   *  when the slot lives inside another grid (e.g. inside an article
   *  column) and the parent handles spacing. */
  variant?: "section" | "none";
  /** Extra classes on the outer wrapper (only used when variant !==
   *  "none"). */
  className?: string;
}

function renderAdContent(ad: Ad, maxWidthPx: number | null) {
  // Style: the inner element fills the slot and never exceeds the
  // ad's intrinsic width. Tailwind would inline arbitrary widths but
  // we'd lose the cap; CSS variable on the wrapper handles it.
  const wrapperStyle: React.CSSProperties = maxWidthPx
    ? { maxWidth: `${maxWidthPx}px`, width: "100%" }
    : { width: "100%" };

  if (ad.type === "image" && ad.imageUrl) {
    const dims = parseAdSize(ad.size);
    const aspectStyle: React.CSSProperties = dims
      ? { aspectRatio: `${dims.width} / ${dims.height}` }
      : {};
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={ad.imageUrl}
        alt={ad.altText || ""}
        style={aspectStyle}
        className="block h-auto w-full object-contain"
        loading="lazy"
      />
    );
    return (
      <div style={wrapperStyle} className="mx-auto">
        {ad.linkUrl ? (
          <a
            href={ad.linkUrl}
            target={ad.linkTarget ?? "_blank"}
            rel={ad.linkTarget === "_blank" ? "noopener noreferrer" : undefined}
            className="block"
          >
            {img}
          </a>
        ) : (
          img
        )}
      </div>
    );
  }

  if (ad.type === "html" && ad.htmlCode) {
    // HTML / iframe / AdSense embed. The cap on max-width keeps it
    // from breaking out of the container; the embed's own contents
    // control the height. We intentionally don't sanitize because
    // the admin is the only writer and the field is gated behind
    // RBAC (configuracoes.editar).
    //
    // ScriptedHtml, not a plain dangerouslySetInnerHTML: every ad
    // network's embed code is markup PLUS <script> tags that do the
    // actual work, and innerHTML never executes those — see the
    // comment on ScriptedHtml for why.
    return (
      <ScriptedHtml
        html={ad.htmlCode}
        style={wrapperStyle}
        className="mx-auto"
      />
    );
  }

  return null;
}

export function AdSlot({ ad, variant = "section", className }: AdSlotProps) {
  if (!ad || !ad.enabled || ad.type === "empty") return null;
  const dims = parseAdSize(ad.size);
  const content = renderAdContent(ad, dims?.width ?? null);
  if (!content) return null;

  if (variant === "none") {
    // Inline placement (used inside columns / sidebars). The parent
    // controls the surrounding spacing.
    return (
      <div className={className ?? ""}>
        {content}
        <p className="mt-1.5 text-center text-[10px] uppercase tracking-wider text-slate-400">
          Publicidade
        </p>
      </div>
    );
  }

  return (
    <section className={`bg-slate-50 py-6 ${className ?? ""}`}>
      <Container>
        {content}
        <p className="mt-2 text-center text-[10px] uppercase tracking-wider text-slate-400">
          Publicidade
        </p>
      </Container>
    </section>
  );
}
