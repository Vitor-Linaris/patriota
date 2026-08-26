import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";

/**
 * Client-side proxy to GET /admin/media. Needed because:
 *   • The media list is consumed by client components (the
 *     MediaLibraryModal) that can't read the httpOnly session cookie
 *     directly.
 *   • Server actions can't be called for plain GETs from React state.
 *
 * The route handler runs server-side, reads the session cookie, and
 * forwards the request with the bearer token attached.
 */

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("patriota_session")?.value;
  if (!token) {
    return NextResponse.json(
      { message: "Unauthorized" },
      { status: 401 },
    );
  }
  const incoming = new URL(req.url);
  const target = new URL(`${apiBaseUrl()}/admin/media`);
  for (const [k, v] of incoming.searchParams.entries()) {
    target.searchParams.set(k, v);
  }
  const res = await fetch(target.toString(), {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
