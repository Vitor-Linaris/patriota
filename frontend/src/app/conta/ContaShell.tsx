import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SiteFooter } from "@/components/home/SiteFooter";

const SECTIONS = [
  { href: "/conta", label: "Resumo", glyph: "▦" },
  { href: "/conta/categorias", label: "Categorias", glyph: "◆" },
  { href: "/conta/guardados", label: "Guardados", glyph: "♥" },
  { href: "/conta/comentarios", label: "Comentários", glyph: "❝" },
  { href: "/conta/historico", label: "Histórico", glyph: "◷" },
] as const;

/**
 * Chrome for the signed-in reader pages.
 *
 * Uses the public site header rather than an admin-style shell: this is
 * part of the newspaper, not a backoffice, and a reader should be one
 * click from going back to reading.
 */
export function ContaShell({
  active,
  title,
  subtitle,
  action,
  children,
}: {
  active: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col bg-white text-slate-900">
      <TopBar />
      <SiteHeader />

      <main className="bg-slate-50 py-10">
        <Container>
          <div className="mx-auto max-w-4xl">
            <nav className="flex flex-wrap gap-2" aria-label="A minha conta">
              {SECTIONS.map((s) => {
                const on = s.href === active;
                return (
                  <Link
                    key={s.href}
                    href={s.href}
                    aria-current={on ? "page" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                      on
                        ? "bg-patriota-pure text-white"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                    }`}
                  >
                    <span aria-hidden>{s.glyph}</span>
                    {s.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-[24px] font-black leading-tight text-slate-900">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>
                )}
              </div>
              {action}
            </div>

            <div className="mt-5">{children}</div>
          </div>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}

/** Consistent empty state across the four sections. */
export function EmptyState({
  glyph,
  title,
  body,
  cta,
}: {
  glyph: string;
  title: string;
  body: string;
  cta?: ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-slate-200 bg-white px-6 py-12 text-center">
      <p aria-hidden className="text-[28px] text-slate-300">
        {glyph}
      </p>
      <p className="mt-2 text-[15px] font-bold text-slate-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-slate-500">
        {body}
      </p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}
