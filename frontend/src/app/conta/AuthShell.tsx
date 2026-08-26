import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Focused layout for the reader auth pages.
 *
 * Deliberately lighter than the rest of the public site: no category nav,
 * no breaking-news ticker, no ad slots. Auth pages convert better without
 * competing navigation, and skipping SiteHeader/SecondaryNav also skips
 * two API round-trips on a page that has nothing to do with the catalogue.
 *
 * Light theme, unlike /admin/login — this is the public site, not the
 * backoffice, and the two should never be mistaken for each other.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="O Patriota — página inicial">
            <Image
              src="/brand/Logo-header.svg"
              alt="O Patriota"
              width={110}
              height={45}
              priority
              className="h-9 w-auto"
            />
          </Link>
          <Link
            href="/"
            className="text-[13px] text-slate-500 transition-colors hover:text-patriota-medium"
          >
            ← Voltar ao site
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-[26px] font-black leading-tight text-slate-900">
              {title}
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
              {subtitle}
            </p>

            <div className="mt-7">{children}</div>
          </div>

          {footer ? (
            <div className="mt-5 text-center text-[13px] text-slate-500">
              {footer}
            </div>
          ) : null}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-5">
        <p className="text-center text-[12px] text-slate-400">
          © {new Date().getFullYear()} O Patriota Notícias ·{" "}
          <Link href="/p/privacidade" className="hover:text-patriota-medium">
            Privacidade
          </Link>{" "}
          ·{" "}
          <Link href="/p/termos" className="hover:text-patriota-medium">
            Termos
          </Link>
        </p>
      </footer>
    </div>
  );
}

/** Shared field styling so the three auth forms stay identical. */
export const fieldClass =
  "h-[46px] w-full rounded-[10px] border border-slate-300 bg-white px-4 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-patriota-pure focus:ring-2 focus:ring-patriota-pure/15";

export const labelClass =
  "text-[11px] font-bold uppercase tracking-[0.4px] text-slate-500";

export const submitClass =
  "mt-1 h-12 w-full rounded-[10px] bg-patriota-pure text-[14px] font-bold text-white transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60";
