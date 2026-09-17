import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";

/**
 * Rewriting a queued post — PATCH /admin/social/:id.
 *
 * The body is passed through rather than reconstructed: the backend is
 * the thing that decides whether this row is still editable, and
 * re-deriving the rule here would give two places to disagree about it.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) {
    return NextResponse.json({ message: "Id inválido." }, { status: 400 });
  }
  const token = (await cookies()).get("patriota_session")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const res = await fetch(`${apiBaseUrl()}/admin/social/${id}`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: await req.text(),
  });
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
