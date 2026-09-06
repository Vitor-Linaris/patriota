"use client";

import { useEffect, useState } from "react";
import { AdSlot } from "./AdSlot";
import { CONSENT_ACCEPTED_EVENT, readConsent } from "@/lib/cookie-consent";
import type { Ad } from "@/lib/ads";

/** Independent of the cookie banner's own 180-day memory — a sticky ad
 *  is allowed to come back and ask again next time; the reader only
 *  ever dismissed it for the session they were in. */
const DISMISS_KEY = "patriota:sticky-ad-dismissed";

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed(): void {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* private mode / quota — the close button still works for this load */
  }
}

/**
 * The banner that slides up from the bottom of the screen and stays
 * there while the reader scrolls — the format on the reference sites
 * (dnoticias.pt's own markup literally calls it a "pushad-footer").
 *
 * The one rule that matters more than the ad itself: it must never be
 * visible at the same time as <CookieConsent/>, which also anchors to
 * the bottom of the screen. Two overlapping fixed-bottom bars reads as
 * broken, not as two features — so this one simply waits. It does not
 * appear at all until cookie consent has already been answered, either
 * because the reader just clicked "Aceitar e continuar" (case handled
 * by the CONSENT_ACCEPTED_EVENT listener, for a mount that predates the
 * click) or because a return visit already carries a saved answer
 * (case handled by the readConsent() check on mount). Belt and braces:
 * even in the moment they were both mounted, this sits at a lower
 * z-index than the cookie banner's z-[90].
 */
export function StickyAdBanner({ ad }: { ad?: Ad | null }) {
  const [consented, setConsented] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setConsented(readConsent() !== null);
    setDismissed(readDismissed());

    function onAccepted() {
      setConsented(true);
    }
    window.addEventListener(CONSENT_ACCEPTED_EVENT, onAccepted);
    return () => window.removeEventListener(CONSENT_ACCEPTED_EVENT, onAccepted);
  }, []);

  useEffect(() => {
    if (!consented || dismissed) return;
    // A beat after the cookie banner has finished fading away (its own
    // transition is 300ms), so the two are never both mid-animation on
    // screen together.
    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, [consented, dismissed]);

  const dismiss = () => {
    persistDismissed();
    setVisible(false);
    setDismissed(true);
  };

  if (!ad || !ad.enabled || ad.type === "empty") return null;

  return (
    <div
      aria-live="polite"
      className={`fixed inset-x-0 bottom-0 z-[80] flex justify-center px-3 pb-3 transition-all duration-300 ease-out sm:px-4 sm:pb-4 ${
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0"
      }`}
    >
      <div className="relative w-full max-w-[766px] rounded-xl bg-white p-2 shadow-[0_20px_60px_-20px_rgba(15,44,107,0.35)]">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fechar anúncio"
          className="absolute -top-3 -right-3 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-slate-800"
        >
          ✕
        </button>
        <AdSlot ad={ad} variant="none" />
      </div>
    </div>
  );
}
