import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";

/**
 * Client-side proxy to GET /admin/articles, for the pacote article picker.
 *
 * Same reason as the media proxy next door: the picker is a client
 * component and cannot read the httpOnly session cookie, and a plain GET
 * cannot go through a server action from React state.
 *
 * One deliberate difference from that proxy — it forwards a WHITELIST of
 * parameters instead of copying whatever arrived. /admin/articles supports
 * a good deal more filtering than the picker needs (author scoping, date
 * ranges, the review queue), and a proxy that passes everything through is
 * a wider surface than the feature asked for.
 *
 * `status` is whitelisted rather than forced: the picker's whole point is
 * that drafts are selectable, so it needs to ask for RASCUNHO. Which
 * statuses may actually end up in a pacote is decided by the API on
 * PUT /admin/packages/:id/articles, which refuses ARQUIVADO and AGENDADO
 * by name. This is convenience; that is the rule.
 */

const FORWARDED = ["q", "page", "pageSize", "status"] as const;

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("patriota_session")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const incoming = new URL(req.url);
  const target = new URL(`${apiBaseUrl()}/admin/articles`);
  for (const key of FORWARDED) {
    const value = incoming.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
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
