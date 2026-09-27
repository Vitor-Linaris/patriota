import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";

/** Marks one notification as read — POST /admin/notificacoes/:id/ler. */
export async function POST(
  _req: Request,
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
  const res = await fetch(`${apiBaseUrl()}/admin/notificacoes/${id}/ler`, {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
