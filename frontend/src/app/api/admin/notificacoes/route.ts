import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";

/**
 * Client-side proxy to GET /admin/notificacoes — the bell's list and
 * unread count. Same shape as every other admin proxy in this app: a
 * client component cannot read the httpOnly session cookie directly, so
 * this same-origin route reads it and forwards the bearer token.
 */
export async function GET(req: Request) {
  const token = (await cookies()).get("patriota_session")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const limit = new URL(req.url).searchParams.get("limit");
  const qs = limit ? `?limit=${encodeURIComponent(limit)}` : "";
  const res = await fetch(`${apiBaseUrl()}/admin/notificacoes${qs}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
