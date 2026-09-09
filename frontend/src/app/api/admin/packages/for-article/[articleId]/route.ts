import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";

/**
 * Which pacotes hold this article, for the "Pacote" field in the article
 * editor.
 *
 * A proxy for the same reason as the others in this folder: the editor is
 * a client component and cannot read the httpOnly session cookie.
 *
 * A 403 here is ordinary — a JORNALISTA has pacotes.ver, but a REVISOR
 * does not — and the editor treats it as "no pacote field", not an error.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ articleId: string }> },
) {
  const { articleId } = await params;
  if (!/^[a-z0-9]{1,40}$/i.test(articleId)) {
    return NextResponse.json({ message: "Id inválido." }, { status: 400 });
  }
  const cookieStore = await cookies();
  const token = cookieStore.get("patriota_session")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const res = await fetch(
    `${apiBaseUrl()}/admin/packages/for-article/${articleId}`,
    { cache: "no-store", headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
