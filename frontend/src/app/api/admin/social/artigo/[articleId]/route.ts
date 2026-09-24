import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";

/**
 * Client-side proxy to GET /admin/social/artigo/:articleId.
 *
 * The card in the article editor is a client component and cannot read
 * the httpOnly session cookie, so the token is attached here. Same shape
 * as the packages and reader-history proxies next door.
 *
 * The id is validated against the cuid alphabet before it goes into a
 * path carrying a bearer token. It is the only thing interpolated.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ articleId: string }> },
) {
  const { articleId } = await params;
  if (!/^[a-z0-9]{1,40}$/i.test(articleId)) {
    return NextResponse.json({ message: "Id inválido." }, { status: 400 });
  }
  const token = (await cookies()).get("patriota_session")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const res = await fetch(`${apiBaseUrl()}/admin/social/artigo/${articleId}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
