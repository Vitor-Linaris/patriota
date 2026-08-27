import { NextResponse } from "next/server";
import { readerApiFetch } from "@/lib/reader-api";

/**
 * Just enough of the reader for the top bar: a display name.
 *
 * Read from the CLIENT rather than server-rendered into the header, and
 * that is not laziness. The homepage and the category pages are cached
 * and prerendered, so a name baked into their HTML would be served to
 * every other visitor. Same reasoning as ReaderActions on the article
 * page: the SSR output stays identical for everyone, and only this small
 * island varies.
 *
 * 401 is a normal answer here, not an error — it means "nobody is
 * signed in", which is most of the traffic.
 */
/**
 * Per-reader and cheap. Both answers carry it, not just the signed-in
 * one: a cached {reader:null} served to somebody who IS signed in would
 * show them the login links, and a cached name is worse still.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const res = await readerApiFetch("/reader/me");

  if (!res || !res.ok) {
    return NextResponse.json(
      { reader: null },
      { status: 200, headers: NO_STORE },
    );
  }

  const me = (await res.json()) as { name?: string | null; email?: string };

  return NextResponse.json(
    {
      reader: {
        // Fall back to the local part of the address so a reader who
        // never set a name is still greeted by something recognisable.
        name: me.name?.trim() || me.email?.split("@")[0] || "Leitor",
      },
    },
    { status: 200, headers: NO_STORE },
  );
}
