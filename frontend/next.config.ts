import type { NextConfig } from "next";

/**
 * Content-Security-Policy, in REPORT-ONLY mode.
 *
 * The site renders editor-authored HTML through `dangerouslySetInnerHTML`
 * (the article body) and, by design, third-party advertising embeds that
 * are script tags. The body is now sanitised on write, but a CSP is the
 * control that limits the damage of the NEXT hole of that kind rather
 * than this one — so it is worth having, and worth getting right before
 * it starts blocking.
 *
 * Report-only on purpose: it reports violations and blocks nothing. Two
 * things are genuinely uncertain until real traffic is measured — the ad
 * networks (AdSense, Taboola, Outbrain each pull further scripts from
 * hosts they choose at runtime) and Next's own inline bootstrap. Turning
 * this to enforcing without that evidence would take the ads off the site
 * to fix a vulnerability that is already fixed.
 *
 * To enforce later: read the reports, add whatever legitimate host they
 * name, then rename the header to `Content-Security-Policy` and drop
 * `unsafe-inline`/`unsafe-eval` from script-src if the reports allow it.
 *
 * `frame-ancestors 'none'` is the one directive that is safe to state
 * plainly today: nothing on this site is meant to be framed, and it is
 * the clickjacking defence that X-Frame-Options used to provide.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // 'unsafe-inline' and 'unsafe-eval' are here because Next's runtime
  // needs them and the ad embeds are inline scripts. They are what a
  // later, stricter pass should try to remove — with nonces — not
  // something to keep for ever.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://pagead2.googlesyndication.com https://securepubads.g.doubleclick.net https://cdn.taboola.com https://widgets.outbrain.com",
  "style-src 'self' 'unsafe-inline'",
  // data: for the inline SVG icons; blob: for client-side image previews
  // in the admin before an upload completes.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // The API, and the ad networks' own measurement calls.
  "connect-src 'self' https:",
  // The video embeds in VideoEmbed.tsx, plus ad iframes.
  "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy-Report-Only",
    value: CSP_REPORT_ONLY,
  },
  // Stops a browser second-guessing a Content-Type. Matters most on the
  // media proxy, which streams a type chosen by the API.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Belt to the CSP's frame-ancestors braces, for anything that predates
  // CSP support.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here uses any of these, so nothing loses anything.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  output: "standalone",
  experimental: {
    serverActions: {
      // Default is 1 MB. Cover-image and inline-image uploads pass through
      // `uploadMediaFileAction` (multipart FormData) and would 413 instantly.
      // 12 MB gives headroom over the backend's 10 MB hard cap (set in
      // backend/.env: MEDIA_MAX_UPLOAD_BYTES) so the backend stays the
      // authoritative limit and rejects oversize files with a real message
      // instead of Next dropping them at the proxy.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
