import Link from "next/link";

export interface Crumb {
  label: string;
  /** Omit on the last crumb — the current page is not a link. */
  href?: string;
}

/**
 * The breadcrumb trail, and the `BreadcrumbList` JSON-LD that goes with
 * it.
 *
 * The two are emitted together on purpose. URLs here are flat
 * (`/categoria/funchal` whatever the depth) because re-parenting a
 * category by drag-and-drop must never break a published link — which
 * means this markup is the ONLY place the hierarchy is expressed to a
 * crawler. Rendering the trail without the JSON-LD, or letting the two
 * drift apart, quietly costs the site the structure it just gained.
 */
export function Breadcrumb({
  items,
  tone = "light",
  className = "",
}: {
  items: Crumb[];
  /** `dark` for the navy hero, `light` for a white page. */
  tone?: "light" | "dark";
  className?: string;
}) {
  if (items.length === 0) return null;

  const base = tone === "dark" ? "text-white/60" : "text-slate-500";
  const link =
    tone === "dark" ? "hover:text-white" : "hover:text-slate-900";
  const current =
    tone === "dark" ? "text-white" : "text-slate-900";
  const sep = tone === "dark" ? "text-white/30" : "text-slate-300";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      // `item` is omitted on the current page, per schema.org guidance:
      // the last crumb is where the reader already is.
      ...(c.href ? { item: c.href } : {}),
    })),
  };

  return (
    <>
      <nav
        aria-label="Breadcrumb"
        className={`flex flex-wrap items-center gap-2 text-[13px] ${base} ${className}`}
      >
        {items.map((c, i) => {
          const isLast = i === items.length - 1;
          return (
            <span key={`${c.label}-${i}`} className="flex items-center gap-2">
              {i > 0 && (
                <span aria-hidden className={sep}>
                  /
                </span>
              )}
              {c.href && !isLast ? (
                <Link href={c.href} className={`transition ${link}`}>
                  {c.label}
                </Link>
              ) : (
                <span className={isLast ? `font-semibold ${current}` : ""} aria-current={isLast ? "page" : undefined}>
                  {c.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      <script
        type="application/ld+json"
        // The payload is built here from our own data, never from user
        // input, so there is no injection surface.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
