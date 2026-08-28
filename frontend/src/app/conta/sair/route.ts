import { NextResponse } from "next/server";
import { READER_COOKIE } from "@/lib/reader-api";

/**
 * Logout. POST only, on purpose: a GET here would be triggered by any
 * link prefetch or corporate mail scanner, silently signing readers out.
 *
 * The Location is RELATIVE. NextResponse.redirect() demands an absolute
 * URL and the only origin available server-side is the one the process
 * is bound to — 0.0.0.0:3005, in dev and in production alike (see the -H
 * flag in package.json). Building the target from req.url sent readers
 * to http://0.0.0.0:3005/, an address no browser can reach, which is
 * what "logging out lands on a page that doesn't exist" was. A relative
 * Location is resolved by the browser against the host it actually used,
 * so it stays right behind a proxy, in a container, or on a real domain.
 *
 * The cookie is cleared on THIS response rather than through cookies(),
 * so the Set-Cookie travels with the redirect that carries the reader
 * away.
 */
export async function POST() {
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/",
      // Belt and braces with the no-store on /conta/:path* in
      // next.config: the page the reader is leaving must not come back
      // from the back button still looking signed in.
      "Cache-Control": "no-store, must-revalidate",
    },
  });
  response.cookies.delete(READER_COOKIE);
  return response;
}
