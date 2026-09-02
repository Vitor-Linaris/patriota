/**
 * The address to display a media file at, inside the admin.
 *
 * Public files — anything already used in something published — come
 * straight from the API, cached hard by the browser, exactly as before.
 *
 * Private files cannot: an `<img>` sends no Authorization header, and
 * the session cookie belongs to this app's origin, not the API's. So
 * they go through a same-origin route that reads the cookie and fetches
 * the file server-side. See app/api/admin/media/file.
 *
 * Only the admin ever needs this. The public site only ever shows
 * published media, which is public by definition.
 */
export function mediaPreviewUrl(
  url: string,
  visibility: "PRIVADO" | "PUBLICO" | null | undefined,
): string {
  if (visibility !== "PRIVADO") return url;

  // The path after /uploads/, whatever host the API is on.
  const i = url.indexOf("/uploads/");
  if (i === -1) return url; // a pasted external URL — not ours to proxy
  return `/api/admin/media/file/${url.slice(i + "/uploads/".length)}`;
}

/**
 * The address to show ANY of our own media at, inside the admin.
 *
 * Same idea as mediaPreviewUrl above, minus the one thing that made it
 * easy to get wrong: it does not need to be told whether the file is
 * private. It never asks, and always goes through the same-origin
 * route, which serves public and private files alike.
 *
 * That matters because most of the admin genuinely cannot know. An
 * article keeps its cover as a plain URL string — there is no foreign
 * key from an article to a media row, by design — so the article list,
 * the editor and the preview page have no visibility to consult. The
 * first version of this only proxied when told to, and every one of
 * those surfaces showed a broken image the moment somebody uploaded a
 * cover, because a fresh upload is private until the article goes out.
 *
 * Costs nothing for public files: the API's Cache-Control passes
 * through the proxy untouched, so they still cache for 30 days.
 *
 * External URLs (a pasted third-party address) are returned as they
 * came — they are not ours to serve.
 */
export function adminMediaUrl(url: string): string;
export function adminMediaUrl(url: null | undefined): null;
export function adminMediaUrl(url: string | null | undefined): string | null;
export function adminMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const i = url.indexOf("/uploads/");
  if (i === -1) return url;
  return `/api/admin/media/file/${url.slice(i + "/uploads/".length)}`;
}
