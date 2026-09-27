import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";

/** POST /admin/notificacoes/marcar-todas-lidas. */
export async function POST() {
  const token = (await cookies()).get("patriota_session")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const res = await fetch(
    `${apiBaseUrl()}/admin/notificacoes/marcar-todas-lidas`,
    {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
