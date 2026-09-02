import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";

/**
 * Shows a private media file to the admin who is allowed to see it.
 *
 * Exists because of one stubborn fact: a browser loading `<img src>`
 * sends no Authorization header, and the session cookie lives on this
 * app's origin while the files are served by the API on another. So an
 * image tag pointed straight at a private file can never authenticate,
 * in any arrangement.
 *
 * This route is same-origin, so the cookie arrives; it reads the token
 * server-side and fetches the file with it.
 *
 * Used for EVERY /uploads/ file shown inside the admin, public and
 * private alike, rather than only the private ones. The reason is that
 * the admin usually cannot tell which is which: an article stores its
 * cover as a plain URL string with no foreign key to the media row, so
 * the article list and the editor have no visibility field to consult.
 * Made conditional it would be right until the first surface that
 * forgot — which is exactly how the editor came to show a broken image
 * for every freshly uploaded cover.
 *
 * Public files lose nothing by it: the API's own Cache-Control is
 * passed straight through, so the browser still keeps them for 30 days
 * and immutably. Only private ones carry `no-store`, which they must.
 *
 * Deliberately NOT a general pass-through: the path is confined to the
 * uploads namespace on the API, so this cannot be turned into a way to
 * replay a session token against the rest of the admin surface. Same
 * rule as the reader BFF routes.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;

  const cookieStore = await cookies();
  const token = cookieStore.get("patriota_session")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Rebuilt from the segments rather than taken from the raw URL, and
  // any segment trying to climb out is refused here as well as by the
  // API. Two cheap checks beat one.
  if (path.some((seg) => seg === ".." || seg.includes("\\"))) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  const target = `${apiBaseUrl()}/uploads/${path
    .map(encodeURIComponent)
    .join("/")}`;

  // The Range header is forwarded and the answer to it passed back
  // untouched. Without this a private video preview cannot be seeked
  // at all, and Safari will not start it: it asks for a range before
  // anything else and treats a plain 200 as a broken source.
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  const upstream = await fetch(target, { cache: "no-store", headers });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const out = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "image/webp",
    // Whatever the API decided, which is the only place that knows
    // whether this file is public. It sends `immutable` for a public
    // one and `private, no-store` for one being shown to the single
    // person entitled to it. Deciding again here could only get it
    // wrong.
    "Cache-Control":
      upstream.headers.get("cache-control") ?? "private, no-store",
    "Accept-Ranges": "bytes",
  });
  for (const h of ["content-range", "content-length"]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }

  // Streamed rather than buffered — a 100 MB video must not be held in
  // this process's memory on the way through.
  return new NextResponse(upstream.body, {
    // 206 when a range was served. Answering 200 would tell the player
    // it received the whole file when it received a slice.
    status: upstream.status === 206 ? 206 : 200,
    headers: out,
  });
}
