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
