"use client";

import { useCallback, useEffect, useState } from "react";
import { AdSlot } from "./AdSlot";
import { CONSENT_ACCEPTED_EVENT, readConsent } from "@/lib/cookie-consent";
import type { Ad } from "@/lib/ads";

/** Two minutes after the reader arrived — not after this page loaded. */
const DELAY_MS = 2 * 60 * 1000;

/**
 * When this visit started, and whether the popup was already dismissed.
 *
 * Both in sessionStorage, and that is the whole behaviour the client
 * asked for: it survives navigating the site and switching tabs, and it
 * is gone when the browser closes — so the next time they open it, the
 * popup comes back after another two minutes.
 *
 * localStorage would remember for ever and the ad would show once in
 * somebody's lifetime. A plain variable would forget on the next click
 * and show it on every page. Neither is what was asked for.
 */
const STARTED_KEY = "patriota:visit-started";
const DISMISS_KEY = "patriota:popup-ad-dismissed";

/** Reads, or starts, the clock for this visit. Returns ms elapsed. */
function elapsedMs(): number {
  try {
    const raw = window.sessionStorage.getItem(STARTED_KEY);
    const started = raw ? Number(raw) : Number.NaN;
    if (Number.isFinite(started) && started > 0) {
      return Date.now() - started;
    }
    window.sessionStorage.setItem(STARTED_KEY, String(Date.now()));
    return 0;
  } catch {
    // Private mode, or storage blocked. The popup then behaves as if
    // the visit began now: it still appears, just measured from this
    // page rather than from the first one.
    return 0;
  }
}

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
    /* The close button still works for this page load. */
  }
}

/**
 * The advertisement that interrupts.
 *
 * Deliberately the only thing on this site that does. Three rules keep
 * it from being the reason somebody stops coming back:
 *
 *   - it waits two minutes, counted from the START of the visit, so it
 *     never lands on somebody who just arrived and never resets because
 *     they clicked a headline;
 *   - it waits for the cookie banner to have been answered, so two
 *     overlays are never on screen at once — the same rule
 *     StickyAdBanner follows, for the same reason;
 *   - once closed it stays closed for the rest of the visit. Every way
 *     out closes it: the ×, Esc, and a click on the dark area.
 *
 * Rendered by SiteFooter, which every public page has, so no page needs
 * to know about it.
 */
export function PopupAd({ ad }: { ad?: Ad | null }) {
  const [open, setOpen] = useState(false);

  const dismiss = useCallback(() => {
    persistDismissed();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!ad || !ad.enabled || ad.type === "empty") return;
    if (readDismissed()) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const arm = () => {
      // Whatever is left of the two minutes. A reader who has been here
      // five minutes already (because the cookie banner sat unanswered)
      // gets it as soon as they answer, not five minutes later.
      const remaining = Math.max(0, DELAY_MS - elapsedMs());
      timer = setTimeout(() => setOpen(true), remaining);
    };

    if (readConsent() !== null) {
      arm();
    } else {
      // Mounted before the reader answered the cookie banner: wait for
      // the answer rather than stacking on top of it.
      const onAccepted = () => arm();
      window.addEventListener(CONSENT_ACCEPTED_EVENT, onAccepted);
      return () => {
        window.removeEventListener(CONSENT_ACCEPTED_EVENT, onAccepted);
        if (timer) clearTimeout(timer);
      };
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [ad]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!ad || !ad.enabled || ad.type === "empty" || !open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Publicidade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
      /* Above the sticky banner (z-80) and the cookie notice (z-90):
         by the time this shows, the cookie notice is answered and gone,
         and if a sticky banner is up this sits in front of it rather
         than behind. */
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm motion-safe:animate-[fadeUp_.35s_cubic-bezier(.16,1,.3,1)_both]"
    >
      <div className="relative w-full max-w-[340px] rounded-2xl bg-white p-3 shadow-[0_30px_80px_-24px_rgba(10,22,41,.6)]">
        <button
          type="button"
          onClick={dismiss}
          /* Not "Fechar anúncio": StickyAdBanner's own close button
             already carries exactly that, and the two can be on screen
             together. Inside an aria-modal dialog a screen reader scopes
             to this one, but anything that scans the whole document —
             an audit tool, a test — would otherwise find two controls
             with one name and no way to tell them apart. */
          aria-label="Fechar esta publicidade"
          /* 44px of tap area on a 28px circle — the visual stays small
             so it does not compete with the creative, the target does
             not, so it can actually be hit on a phone. */
          className="absolute -top-3.5 -right-3.5 flex h-11 w-11 items-center justify-center text-slate-600"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-[13px] shadow-sm transition-colors hover:text-slate-900">
            ✕
          </span>
        </button>
        {/* No "Publicidade" label of its own: AdSlot already prints one
            under the creative, and two on a 340px card read as a mistake
            rather than as a disclosure. */}
        <AdSlot ad={ad} variant="none" />
      </div>
    </div>
  );
}
