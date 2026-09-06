"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { persistConsent, readConsent } from "@/lib/cookie-consent";

/**
 * Cookie consent banner. Slides in from the bottom on first visit,
 * stays out of the way once dismissed, reappears after EXPIRY_DAYS.
 *
 * We render nothing until after hydration so SSR HTML is stable
 * (no hydration mismatch). The 200ms entrance is purely cosmetic —
 * gives the visitor a beat to notice the banner without it crashing
 * onto the screen.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!readConsent()) {
      // Tiny delay so the entrance animation has something to play.
      const t = setTimeout(() => setVisible(true), 200);
      return () => clearTimeout(t);
    }
  }, []);

  const accept = () => {
    persistConsent();
    setVisible(false);
  };

  if (!mounted) return null;

  return (
    <div
      aria-live="polite"
      className={`fixed inset-x-0 bottom-0 z-[90] flex justify-center px-4 pb-4 transition-all duration-300 ease-out sm:px-6 sm:pb-6 ${
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0"
      }`}
      role="dialog"
      aria-labelledby="cookie-consent-title"
    >
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-20px_rgba(15,44,107,0.35)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex-1">
            <p
              id="cookie-consent-title"
              className="text-[14px] font-bold text-slate-900"
            >
              🍪 Este site usa cookies
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
              Usamos apenas cookies estritamente necessários (sessão e
              medição agregada de leituras). Não partilhamos dados com
              redes publicitárias.{" "}
              <Link
                href="/p/cookies"
                className="font-semibold text-patriota-medium underline-offset-2 hover:underline"
              >
                Saber mais
              </Link>
              .
            </p>
          </div>
          <button
            type="button"
            onClick={accept}
            className="shrink-0 rounded-xl bg-patriota-dark px-5 py-2.5 text-[14px] font-bold text-white transition-colors hover:bg-patriota-medium"
          >
            Aceitar e continuar
          </button>
        </div>
      </div>
    </div>
  );
}
