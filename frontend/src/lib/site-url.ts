/**
 * The canonical public address of the site.
 *
 * Every shared link, Open Graph tag and metadataBase has to agree on one
 * origin. The reader may have arrived on any host — a preview domain, an
 * IP, localhost — and what gets stamped into a share card must still be
 * the address the newsroom publishes under, not wherever this particular
 * request landed.
 *
 * Kept as its own module rather than inlined because layout.tsx and the
 * article page both need it, and two copies of a fallback URL is exactly
 * how one of them ends up stale.
 */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.opatriota.pt";
}
