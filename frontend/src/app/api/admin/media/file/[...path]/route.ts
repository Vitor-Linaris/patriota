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
 * server-side and fetches the file with it. Only used for previews of
 * media that has not been published — everything already on the site is
 * fetched directly from its real URL, with no proxy in the way.
 *
 * Deliberately NOT a general pass-through: the path is confined to the
 * uploads namespace on the API, so this cannot be turned into a way to
 * replay a session token against the rest of the admin surface. Same
 * rule as the reader BFF routes.
 */
export async function GET(
  _req: Request,
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

  const upstream = await fetch(target, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  // Streamed rather than buffered: these are images, and a video will
  // be along shortly.
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/webp",
      // Private, so never in a shared cache. `no-store` and not the
      // API's `immutable`: the moment the article is published the
      // real URL takes over, and a stale copy of the preview would
      // outlive the reason this route was used at all.
      "Cache-Control": "private, no-store",
    },
  });
}
