import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";
import { FEATURES } from "@/lib/features";
import { READER_COOKIE, safeNext } from "@/lib/reader-api";

/**
 * Landing endpoint for the OAuth callback.
 *
 * The backend redirects here carrying a ONE-TIME CODE, never the session
 * token: a JWT in a redirect URL ends up in browser history, in the
 * Referer of every subsequent request, and in the access log of every
 * proxy in between. This endpoint trades the code for the token
 * server-side and writes the httpOnly cookie, so the token never reaches
 * the URL bar.
 *
 * A ROUTE HANDLER, not a page. This was a Server Component that called
 * cookies().set() during render, which Next refuses outright — HTTP
 * cannot set a cookie once streaming has begun, so the write has to
 * happen where response headers are still being assembled. The bug was
 * invisible until the day real Google credentials existed, because
 * without them the provider route 404s and this code never ran.
 *
 * Errors go back to the login page rather than to a dead end of their
 * own: that is where the reader can immediately try again, with the
 * buttons already in front of them.
 */
/**
 * A RELATIVE Location, deliberately.
 *
 * NextResponse.redirect() demands an absolute URL, and the only origin
 * available server-side is the one the process is bound to — which is
 * `0.0.0.0:3005` here, in dev and in production alike (see the -H flag
 * in package.json). Redirecting there hands the browser an address it
 * cannot reach. A relative Location is resolved by the browser against
 * whatever host it actually used, so it is right behind a proxy, a
 * container, or a real domain without anyone having to configure it.
 */
function redirectTo(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const backToLogin = (reason?: string) =>
    redirectTo(
      `/conta/entrar${reason ? `?erro=${encodeURIComponent(reason)}` : ""}`,
    );

  if (!FEATURES.readerArea) {
    return new NextResponse(null, { status: 404 });
  }

  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? undefined;
  const erro = url.searchParams.get("erro");

  // The backend already refused — it passes "1" when it has nothing
  // safe to say, and a message when it does.
  if (erro) return backToLogin(erro === "1" ? undefined : erro);
  if (!code) return backToLogin();

  let accessToken: string | undefined;
  try {
    const res = await fetch(`${apiBaseUrl()}/public/reader/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
    });
    if (res.ok) {
      accessToken = ((await res.json()) as { accessToken?: string })
        .accessToken;
    }
  } catch {
    // A spent or expired code, or the API being unreachable. Either way
    // the reader gets sent back to try again.
  }

  if (!accessToken) return backToLogin();

  const response = redirectTo(safeNext(next));
  response.cookies.set(READER_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax", not "strict": this request IS the landing of a cross-site
    // top-level redirect from the provider, and a strict cookie set here
    // would not be sent on the redirect that follows.
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
