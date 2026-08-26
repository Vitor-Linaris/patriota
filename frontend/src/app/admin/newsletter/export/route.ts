import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";

const SESSION_COOKIE = "patriota_session";

/**
 * Proxy for the subscriber export. The backend lives at a different
 * origin than the admin UI (api:8585 vs web:3005) so a direct
 * <a href> from the browser doesn't carry the patriota_session
 * cookie. We re-issue the request server-side, attach the JWT, and
 * stream the file back to the user.
 *
 * Usage:
 *   /admin/newsletter/export?format=csv
 *   /admin/newsletter/export?format=xlsx
 */
export async function GET(req: NextRequest): Promise<Response> {
  const format = req.nextUrl.searchParams.get("format");
  if (format !== "csv" && format !== "xlsx") {
    return new NextResponse("format must be csv or xlsx", { status: 400 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const upstream = await fetch(
    `${apiBaseUrl()}/admin/newsletters/subscribers/export.${format}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  if (!upstream.ok) {
    return new NextResponse(
      `Upstream error (${upstream.status})`,
      { status: upstream.status },
    );
  }

  // Forward the file as-is. We pass through Content-Type and the
  // suggested filename so the browser saves it with a sensible name.
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const disposition = upstream.headers.get("content-disposition");
  if (disposition) headers.set("Content-Disposition", disposition);

  return new NextResponse(upstream.body, { headers });
}
