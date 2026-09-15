import { headers } from "next/headers";

/** Must match backend/src/common/bff-throttler.guard.ts. */
const CLIENT_IP_HEADER = "x-patriota-client-ip";
const BFF_SECRET_HEADER = "x-patriota-bff";

/**
 * The visitor's address, forwarded to the API so rate limits can tell
 * two visitors apart.
 *
 * Every request a browser makes to the API goes through this process,
 * server-side, which opens its own connection and forwards nothing about
 * who asked. The API then had no client address to key on and counted
 * ALL of the public as one visitor: five failed logins by anybody spent
 * the whole newsroom's budget, turning the defence into a denial of
 * service against everyone else.
 *
 * The secret is what stops this being a free choice of bucket for
 * everyone. The API is reachable directly by a browser — the OAuth legs
 * are a plain navigation to it — so an address header on its own would
 * be worse than no header at all. The API ignores the address unless the
 * secret comes with it, and falls back to its own view of the connection
 * when BFF_SHARED_SECRET is unset on either side.
 *
 * Server-only: `headers()` throws in a client component.
 */
export async function clientIpHeaders(): Promise<Record<string, string>> {
  const secret = process.env.BFF_SHARED_SECRET;
  if (!secret) return {};

  try {
    const h = await headers();
    // The real edge proxy's own X-Forwarded-For. First entry is the
    // client; the rest are hops, which is why this is not the whole
    // header value.
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip")?.trim();
    if (!ip) return {};
    return { [CLIENT_IP_HEADER]: ip, [BFF_SECRET_HEADER]: secret };
  } catch {
    // Outside a request scope (a build-time render, a background job).
    // Nothing to forward, and the API keys on its own view instead.
    return {};
  }
}
