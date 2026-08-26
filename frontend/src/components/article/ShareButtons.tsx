"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * Share links — plain https:// URLs, no SDK.
 *
 * The Facebook SDK sets cookies and would drag this page into the consent
 * banner for no benefit; a sharer URL needs nothing but an anchor.
 *
 * Note the WhatsApp URL is https://wa.me/, NOT the whatsapp:// scheme
 * that some Portuguese titles use. The protocol scheme only resolves when
 * the desktop app is installed, which is why sites using it hide the
 * button on desktop. wa.me opens WhatsApp Web on desktop and the app on
 * mobile, so it can stay visible everywhere.
 */
function targets(url: string, title: string) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return [
    {
      key: "whatsapp",
      label: "Partilhar no WhatsApp",
      glyph: "✆",
      href: `https://wa.me/?text=${t}%20${u}`,
    },
    {
      key: "facebook",
      label: "Partilhar no Facebook",
      glyph: "f",
      href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    },
    {
      key: "x",
      label: "Partilhar no X",
      glyph: "𝕏",
      href: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    },
    {
      key: "email",
      label: "Enviar por e-mail",
      glyph: "✉",
      href: `mailto:?subject=${t}&body=${u}`,
    },
  ];
}

const btn =
  "flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-[13px] text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900";

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  // Feature detection that is safe across hydration: the server snapshot
  // is always false, so SSR and the first client render agree, and React
  // swaps in the real value on the client without a cascading effect.
  // navigator.share never changes for the life of the page, hence the
  // no-op subscribe.
  const canNativeShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== "undefined" && !!navigator.share,
    () => false,
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is permission-gated; failing silently beats an alert.
    }
  }

  // On a phone the OS sheet beats a row of six icons on a narrow screen.
  if (canNativeShare) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void navigator.share({ title, url })}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
        >
          <span aria-hidden>⇪</span> Partilhar
        </button>
        <button
          type="button"
          onClick={copy}
          aria-label="Copiar ligação"
          className={btn}
        >
          {copied ? "✓" : "🔗"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {targets(url, title).map((s) => (
        <a
          key={s.key}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={s.label}
          title={s.label}
          className={btn}
        >
          <span aria-hidden>{s.glyph}</span>
        </a>
      ))}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Ligação copiada" : "Copiar ligação"}
        title={copied ? "Ligação copiada" : "Copiar ligação"}
        className={btn}
      >
        <span aria-hidden>{copied ? "✓" : "🔗"}</span>
      </button>
    </div>
  );
}
