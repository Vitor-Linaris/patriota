/**
 * Shared between CookieConsent.tsx and StickyAdBanner.tsx — the sticky ad
 * banner has to know whether the cookie banner has been answered, so the
 * two fixed-bottom overlays never show at once. See the comment on
 * StickyAdBanner for why that matters.
 */

const STORAGE_KEY = "patriota:cookie-consent";

/** Fired the moment CookieConsent's "Aceitar e continuar" is clicked, so
 *  anything already mounted (the sticky ad banner) can react immediately
 *  instead of waiting for its own poll. */
export const CONSENT_ACCEPTED_EVENT = "patriota:cookie-consent-accepted";

/**
 * Days the user's choice is remembered before we re-ask. See the note in
 * CookieConsent.tsx — kept here too since readConsent() enforces it.
 */
const EXPIRY_DAYS = 180;

interface StoredConsent {
  acceptedAt: number;
}

export function readConsent(): StoredConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (typeof parsed.acceptedAt !== "number") return null;
    const expiresAt = parsed.acceptedAt + EXPIRY_DAYS * 86_400 * 1000;
    if (Date.now() > expiresAt) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as StoredConsent;
  } catch {
    return null;
  }
}

export function persistConsent(): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ acceptedAt: Date.now() } satisfies StoredConsent),
    );
  } catch {
    /* private-mode / quota — accept the loss, banner will reappear */
  }
  window.dispatchEvent(new Event(CONSENT_ACCEPTED_EVENT));
}
