/**
 * Image variant helper.
 *
 * Uploaded images (Phase U) are processed by `sharp` into three WebP
 * variants stored side-by-side on disk:
 *
 *   uploads/2026/05/<id>-small.webp     (~400px wide)
 *   uploads/2026/05/<id>-medium.webp    (~800px wide)
 *   uploads/2026/05/<id>-large.webp     (~1600px wide)
 *
 * The backend persists the "large" URL as `Media.url` (and on
 * `Article.coverImageUrl`). Other variants are derived by string
 * replacement here — that keeps the schema thin and avoids new joins
 * on every render.
 *
 * For external URLs (manual URL paste, legacy data, seed) the helper
 * is a no-op and returns the original URL. So degradation is graceful
 * — an `<img>` consumer always gets *some* URL back.
 */

export type ImageVariant = "small" | "medium" | "large";

const LARGE_RE = /-large\.webp$/i;

/**
 * Return the URL of the requested variant, or the original URL when
 * the input doesn't match the upload naming convention (external
 * sources, legacy rows).
 */
export function imageVariant(
  url: string | null | undefined,
  variant: ImageVariant,
): string | null {
  if (!url) return null;
  if (!LARGE_RE.test(url)) return url;
  if (variant === "large") return url;
  return url.replace(LARGE_RE, `-${variant}.webp`);
}
