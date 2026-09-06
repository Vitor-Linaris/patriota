import Image from "next/image";
import Link from "next/link";
import { Container } from "../Container";
import { getSocialLinks, type SocialLinks } from "@/lib/public-api";
import { getRootCategories } from "@/lib/categories";
import { CookieConsent } from "./CookieConsent";
import { StickyAdBanner } from "@/components/ads/StickyAdBanner";
import type { Ad } from "@/lib/ads";

interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  title: string;
  items: FooterLink[];
}

// Static pages live at /p/<slug>. "Rubricas" point at the category
// routes so navigation stays consistent with the secondary nav.
const COLUMNS: FooterColumn[] = [
  {
    title: "Editorial",
    items: [
      { label: "Estatuto", href: "/p/estatuto-editorial" },
      { label: "Equipa", href: "/p/equipa" },
      { label: "Política de Correções", href: "/p/politica-correcoes" },
      { label: "Transparência", href: "/p/transparencia" },
    ],
  },
  // "Rubricas" is filled from the live catalogue at render time — see
  // SiteFooter below. Hardcoding it meant a renamed or deleted category
  // left a dead link in the footer that nothing would ever flag.
  {
    title: "Contacto",
    items: [
      { label: "Redação", href: "/p/redaccao" },
      { label: "Publicidade", href: "/p/publicidade" },
      { label: "Assinatura", href: "/p/assinatura" },
      { label: "Imprensa", href: "/p/imprensa" },
    ],
  },
  {
    title: "Legal",
    items: [
      { label: "Termos de Uso", href: "/p/termos" },
      { label: "Privacidade", href: "/p/privacidade" },
      { label: "Cookies", href: "/p/cookies" },
      { label: "ERC", href: "/p/erc" },
    ],
  },
];

/**
 * Social links rendered under the brand logo. Each platform uses a
 * lightweight inline SVG so we don't depend on an icon library. The
 * row collapses to nothing when no link is configured — keeps the
 * footer tidy until the admin fills in /admin/configuracoes › Redes.
 */
function SocialIcons({ links }: { links: SocialLinks }) {
  const items: Array<{
    key: keyof SocialLinks;
    label: string;
    href: string | undefined;
    path: string;
  }> = [
    {
      key: "facebook",
      label: "Facebook",
      href: links.facebook,
      // Facebook "f" glyph
      path: "M22 12a10 10 0 1 0-11.6 9.9V14.9H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.5 2.9h-2.3v7A10 10 0 0 0 22 12z",
    },
    {
      key: "twitter",
      label: "X (Twitter)",
      href: links.twitter,
      // X (Twitter) outline
      path: "M18.244 2H21l-6.52 7.45L22 22h-6.86l-4.49-5.85L5.4 22H2.64l6.97-7.97L2 2h7l4.08 5.4L18.244 2zm-1.2 18h1.74L7.04 4H5.2l11.844 16z",
    },
    {
      key: "instagram",
      label: "Instagram",
      href: links.instagram,
      // Instagram camera (simplified)
      path: "M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.23.42.56.22.96.48 1.38.9.42.42.68.82.9 1.38.17.42.37 1.06.42 2.23.06 1.25.07 1.65.07 4.85s0 3.6-.07 4.85c-.05 1.17-.25 1.8-.42 2.23-.22.56-.48.96-.9 1.38a3.7 3.7 0 0 1-1.38.9c-.42.17-1.06.37-2.23.42-1.25.06-1.65.07-4.85.07s-3.6 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.42a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.17-.42-.37-1.06-.42-2.23C2.21 15.6 2.2 15.2 2.2 12s0-3.6.07-4.85c.05-1.17.25-1.8.42-2.23.22-.56.48-.96.9-1.38a3.7 3.7 0 0 1 1.38-.9c.42-.17 1.06-.37 2.23-.42C8.4 2.21 8.8 2.2 12 2.2zm0 1.8c-3.15 0-3.52 0-4.76.07-1.07.05-1.65.23-2.04.38-.51.2-.88.44-1.26.83a3.5 3.5 0 0 0-.83 1.26c-.15.39-.33.97-.38 2.04C2.66 8.48 2.65 8.85 2.65 12s0 3.52.08 4.76c.05 1.07.23 1.65.38 2.04.2.51.44.88.83 1.26.38.39.75.63 1.26.83.39.15.97.33 2.04.38 1.24.07 1.61.08 4.76.08s3.52 0 4.76-.08c1.07-.05 1.65-.23 2.04-.38a3.5 3.5 0 0 0 1.26-.83c.39-.38.63-.75.83-1.26.15-.39.33-.97.38-2.04.07-1.24.08-1.61.08-4.76s0-3.52-.08-4.76c-.05-1.07-.23-1.65-.38-2.04a3.5 3.5 0 0 0-.83-1.26 3.5 3.5 0 0 0-1.26-.83c-.39-.15-.97-.33-2.04-.38C15.52 4 15.15 4 12 4zm0 3.06a4.94 4.94 0 1 1 0 9.88 4.94 4.94 0 0 1 0-9.88zm0 1.8a3.14 3.14 0 1 0 0 6.28 3.14 3.14 0 0 0 0-6.28zm5.16-2.1a1.16 1.16 0 1 1-2.32 0 1.16 1.16 0 0 1 2.32 0z",
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      href: links.linkedin,
      // LinkedIn "in"
      path: "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.34 18.34H5.66V9.66h2.68v8.68zM7 8.5a1.55 1.55 0 1 1 0-3.1 1.55 1.55 0 0 1 0 3.1zm11.34 9.84h-2.68V14.1c0-1 0-2.28-1.39-2.28-1.39 0-1.6 1.08-1.6 2.2v4.32h-2.68V9.66h2.57v1.18h.04a2.82 2.82 0 0 1 2.54-1.4c2.72 0 3.22 1.79 3.22 4.12v4.78z",
    },
    {
      key: "youtube",
      label: "YouTube",
      href: links.youtube,
      // YouTube play button
      path: "M23.5 7.2a3 3 0 0 0-2.12-2.12C19.5 4.55 12 4.55 12 4.55s-7.5 0-9.38.53A3 3 0 0 0 .5 7.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 4.8 3 3 0 0 0 2.12 2.12C4.5 19.45 12 19.45 12 19.45s7.5 0 9.38-.53a3 3 0 0 0 2.12-2.12A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-4.8zM9.55 15.6V8.4l6.27 3.6-6.27 3.6z",
    },
  ];

  const visible = items.filter((i) => i.href && i.href.trim().length > 0);
  if (visible.length === 0) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      {visible.map((item) => (
        <a
          key={item.key}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={item.label}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:border-patriota-accent hover:bg-patriota-accent hover:text-patriota-ink"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className="h-4 w-4"
          >
            <path d={item.path} />
          </svg>
        </a>
      ))}
    </div>
  );
}

export async function SiteFooter({
  stickyAd,
}: {
  /** Homepage/Artigo's own "…-sticky" slot — omitted (or unconfigured)
   *  renders nothing, same as every other AdSlot. */
  stickyAd?: Ad | null;
} = {}) {
  const [social, roots] = await Promise.all([
    getSocialLinks(),
    getRootCategories(),
  ]);

  // Top-level sections only, in the order the admin arranged them.
  // Inserted after "Editorial" so the column order stays as designed.
  const rubricas: FooterColumn = {
    title: "Rubricas",
    items: roots.slice(0, 5).map((c) => ({
      label: c.label,
      href: `/categoria/${c.slug}`,
    })),
  };
  const columns =
    rubricas.items.length > 0
      ? [COLUMNS[0], rubricas, ...COLUMNS.slice(1)]
      : COLUMNS;

  return (
    <>
    <footer className="bg-patriota-dark text-white">
      <Container className="py-12">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          {/* Brand + social */}
          <div>
            <Link href="/" aria-label="O Patriota" className="inline-flex">
              <Image
                src="/brand/Logo-footer.svg"
                alt="O Patriota"
                width={89}
                height={37}
                className="h-auto"
              />
            </Link>
            <SocialIcons links={social} />
          </div>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-12">
            {columns.map((col) => (
              <div key={col.title}>
                <h4 className="text-[12px] font-bold uppercase tracking-wider text-patriota-accent">
                  {col.title}
                </h4>
                <ul className="mt-3 flex flex-col gap-2 text-[13px] text-white/70">
                  {col.items.map((it) => (
                    <li key={it.label}>
                      <a
                        className="transition-colors hover:text-patriota-accent"
                        href={it.href}
                      >
                        {it.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-[12px] text-white/50 md:flex-row md:items-center md:justify-between">
          <span>© 2026 O Patriota Notícias. Todos os direitos reservados.</span>
          <span>www.opatriota.pt</span>
        </div>
      </Container>
    </footer>
    {/* Cookie consent banner — only on public pages (admin doesn't
        render SiteFooter). Self-managed via localStorage. */}
    <CookieConsent />
    {/* Sticky footer ad — see StickyAdBanner.tsx for why it never
        shows until the cookie banner above has been answered. */}
    <StickyAdBanner ad={stickyAd} />
    </>
  );
}
