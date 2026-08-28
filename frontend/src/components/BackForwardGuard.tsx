"use client";

import { useEffect } from "react";

/**
 * Re-fetches the page when the browser restores it from the
 * back/forward cache.
 *
 * The problem: after "terminar sessão", pressing Back brought the
 * dashboard back fully rendered and still looking signed in. The server
 * is never asked — the browser keeps a live snapshot of the document
 * (the bfcache) and restores it whole, script state and all.
 *
 * `Cache-Control: no-store` is the documented way to opt a page out of
 * that cache, and in PRODUCTION Next already sends it on every dynamic
 * page — anything that reads cookies, which is every authenticated page
 * here. But `next dev` overrides Cache-Control on all pages with
 * `no-cache, must-revalidate` and ignores whatever next.config sets
 * (base-server.js: "In dev, we should not cache pages for any reason"),
 * so in development the snapshot is restorable and the stale dashboard
 * comes back.
 *
 * Rather than depend on a header that behaves differently in the two
 * environments, this listens for the restore itself. `persisted` is true
 * only on a bfcache restore, so a normal load costs nothing; on a
 * restore the reload hits the server, the session cookie is gone, and
 * requireReader() sends the reader to the login page.
 */
export function BackForwardGuard() {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}
