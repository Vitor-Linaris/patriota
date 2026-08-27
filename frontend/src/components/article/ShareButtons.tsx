"use client";

import { useState, useSyncExternalStore } from "react";
import {
  FaFacebookF,
  FaLinkedinIn,
  FaWhatsapp,
  FaXTwitter,
} from "react-icons/fa6";
import { HiOutlineMail } from "react-icons/hi";
import { FiCheck, FiLink, FiShare2 } from "react-icons/fi";

/**
 * Share row — icons only, no labels.
 *
 * Plain https:// links, no SDK: the Facebook SDK sets cookies and would
 * drag this page into the consent banner for nothing. A sharer URL needs
 * an anchor and that is all.
 *
 * The WhatsApp URL is https://wa.me/, NOT the whatsapp:// scheme some
 * Portuguese titles use. That one only resolves when the desktop app is
 * installed, which is why those sites hide the button on desktop; wa.me
 * opens WhatsApp Web on desktop and the app on mobile, so it stays
 * visible everywhere.
 */
function targets(url: string, title: string) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return [
    {
      key: "whatsapp",
      label: "Partilhar no WhatsApp",
      Icon: FaWhatsapp,
      href: `https://wa.me/?text=${t}%20${u}`,
    },
    {
      key: "facebook",
      label: "Partilhar no Facebook",
      Icon: FaFacebookF,
      href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    },
    {
      key: "x",
      label: "Partilhar no X",
      Icon: FaXTwitter,
      href: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    },
    {
      key: "linkedin",
      label: "Partilhar no LinkedIn",
      Icon: FaLinkedinIn,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    },
    {
      key: "email",
      label: "Enviar por e-mail",
      Icon: HiOutlineMail,
      href: `mailto:?subject=${t}&body=${u}`,
    },
  ];
}

/** Shared circle. Exported so the comment counter matches it exactly. */
export const ICON_BUTTON =
  "flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:border-patriota-medium hover:bg-slate-50 hover:text-patriota-medium";

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  // Feature detection that survives hydration: the server snapshot is
  // always false, so SSR and the first client render agree, and React
  // swaps in the real value without a cascading effect. navigator.share
  // never changes for the life of the page, hence the no-op subscribe.
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

  // On a phone the OS sheet beats a row of six circles on a narrow screen.
  if (canNativeShare) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void navigator.share({ title, url })}
          aria-label="Partilhar"
          title="Partilhar"
          className={ICON_BUTTON}
        >
          <FiShare2 size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Ligação copiada" : "Copiar ligação"}
          title={copied ? "Ligação copiada" : "Copiar ligação"}
          className={ICON_BUTTON}
        >
          {copied ? <FiCheck size={16} aria-hidden /> : <FiLink size={16} aria-hidden />}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {targets(url, title).map(({ key, label, Icon, href }) => (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className={ICON_BUTTON}
        >
          <Icon size={15} aria-hidden />
        </a>
      ))}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Ligação copiada" : "Copiar ligação"}
        title={copied ? "Ligação copiada" : "Copiar ligação"}
        className={ICON_BUTTON}
      >
        {copied ? <FiCheck size={16} aria-hidden /> : <FiLink size={16} aria-hidden />}
      </button>
    </div>
  );
}
