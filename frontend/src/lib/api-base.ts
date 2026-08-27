/**
 * Single source of truth for the backend base URL.
 *
 * Resolution order matters:
 *   • INTERNAL_API_URL   — server→server inside Docker (http://api:8585).
 *     Only ever set on the server, so it never leaks into the browser bundle.
 *   • NEXT_PUBLIC_API_URL — browser→API across the network.
 *   • http://api:8585     — the compose service name, so a fresh clone works.
 *
 * Kept dependency-free on purpose: proxy.ts runs in the Edge runtime and
 * cannot pull in anything Node-only.
 */
export function apiBaseUrl(): string {
  return (
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://api:8585"
  );
}
