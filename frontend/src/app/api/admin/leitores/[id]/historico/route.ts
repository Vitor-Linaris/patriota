import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";

/**
 * Client-side proxy to GET /admin/readers/:id/historico.
 *
 * The ban dialog is a client component — it opens over a queue that is
 * already rendered, and fetches the history for the one reader the
 * moderator is about to act on. A plain GET from React state cannot go
 * through a server action, and a client component cannot read the
 * httpOnly session cookie. Same shape as the packages proxy next door.
 *
 * The id is validated against the cuid alphabet before it goes into a
 * path carrying a bearer token. It is the only thing interpolated here.
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
  const res = await fetch(`${apiBaseUrl()}/admin/readers/${id}/historico`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
