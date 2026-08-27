"use client";

import { useState } from "react";
import {
  FaFacebookF,
  FaLinkedinIn,
  FaWhatsapp,
  FaXTwitter,
} from "react-icons/fa6";
import { HiOutlineMail } from "react-icons/hi";
import { FiCheck, FiLink } from "react-icons/fi";

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

/**
 * NOTE: there is deliberately no navigator.share branch here.
 *
 * An earlier version swapped this whole row for the OS share sheet
 * whenever navigator.share existed, on the assumption that it meant a
 * phone. It does not — Chrome on Windows has had the Web Share API since
 * version 89 — so desktop readers watched the icons arrive from the
 * server and then vanish the moment hydration ran.
 *
 * Rendering the same row everywhere costs nothing (six 36px circles fit
 * a 375px screen) and removes the swap entirely, which is worth more
 * than the native sheet ever was.
 */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is permission-gated; failing silently beats an alert.
    }
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
        {copied ? (
          <FiCheck size={16} aria-hidden />
        ) : (
          <FiLink size={16} aria-hidden />
        )}
      </button>
    </div>
  );
}
