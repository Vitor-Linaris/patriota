import { NextResponse, type NextRequest } from "next/server";
import { apiBaseUrl } from "@/lib/api-base";

/**
 * Counts unique daily visitors to the public surfaces of the site.
 *
 * Why a Next.js proxy (and not a backend interceptor):
 *   • The proxy sees the actual user-agent + IP of the visitor, once
 *     per page load. The backend only sees server-to-server SSR fetches
 *     which would over-count by a factor of N per render.
 *   • We compute a stable hash of (IP + UA + daily salt) here and ship
 *     only the hash to the backend, so the raw IP never crosses the
 *     internal network. The backend stores hashes in a Redis SET so
 *     the same visitor counts once per day.
 *
 * Important: the fetch is fire-and-forget — we never await it before
 * continuing to the route, so users never wait for the tracker.
 *
 * Next.js 16 renamed the `middleware` file convention to `proxy`. The
 * exported function MUST be named `proxy` (not `middleware`).
 */

const BOT_RE = /bot|crawler|spider|preview|monitor|curl|wget|python-requests|headless/i;

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "0.0.0.0";
}

async function visitorHash(ip: string, ua: string): Promise<string> {
  // Daily salt rotates the hash every UTC day, so visitors that come
  // back tomorrow count again — and a leaked dump of hashes is useless
  // 24h later.
  const day = new Date().toISOString().slice(0, 10);
  const payload = `${day}|${ip}|${ua}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  // hex-encode the first 16 bytes (128 bits) — plenty of entropy for
  // ~10k daily visitors with collision probability ≈ 0.
  const bytes = new Uint8Array(digest).slice(0, 16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function proxy(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  if (!BOT_RE.test(ua)) {
    const ip = getClientIp(req);
    void visitorHash(ip, ua)
      .then((hash) =>
        fetch(`${apiBaseUrl()}/public/visits/track`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visitor: hash }),
          // Edge fetch — no keepalive needed; backend is on the same docker network.
          cache: "no-store",
        }),
      )
      .catch(() => {
        /* fire-and-forget: never block the response */
      });
  }
  return NextResponse.next();
}

/**
 * Match only the public surfaces. /admin and Next.js internals are
 * explicitly excluded so:
 *   1. Internal traffic (admins reloading the dashboard) doesn't inflate
 *      visit counts.
 *   2. The tracker fetch never fires for static assets.
 */
export const config = {
  matcher: ["/", "/artigo/:path*", "/categoria/:path*"],
};
