import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";

/**
 * Client-side proxy to GET /admin/packages/:id.
 *
 * The editor panel needs one pacote's members with their CURRENT article
 * status and `exclusive` flag, and it needs them again after every publish
 * — a client component, a plain GET, and an httpOnly cookie it cannot
 * read. Same shape as the media and articles proxies next door.
 *
 * The id is validated against the cuid alphabet before it is put in a
 * path with a bearer token attached. It is the only thing interpolated
 * here, and it is not going to be a traversal.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) {
    return NextResponse.json({ message: "Id inválido." }, { status: 400 });
  }
  const cookieStore = await cookies();
  const token = cookieStore.get("patriota_session")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const res = await fetch(`${apiBaseUrl()}/admin/packages/${id}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
