"use client";

import { useState } from "react";
import { FEATURES } from "@/lib/features";
import { imageVariant } from "@/lib/images";
import type { ArticleSummary } from "@/lib/public-api";

type Tab = "recentes" | "lidas";

/**
 * Sidebar widget with two functional tabs: Mais Recentes / Mais
 * Lidas. The parent server component pre-fetches both lists so this
 * client component is purely UI state — no extra round-trip on tab
 * switch.
 *
 * The "Mais Comentadas" / "Escolha da Redação" tabs from the old
 * design are gone — they relied on comments + editorial picks which
 * we don't surface yet.
 */
export function SidebarTopList({
  recent,
  mostRead,
}: {
  recent: ArticleSummary[];
  mostRead: ArticleSummary[];
}) {
  const [tab, setTab] = useState<Tab>("recentes");
  const items = tab === "recentes" ? recent : mostRead;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <nav
        aria-label="Selector"
        className="flex border-b border-slate-200 text-[12px]"
      >
        {(
          [
            { key: "recentes" as const, label: "Mais Recentes" },
            { key: "lidas" as const, label: "Mais Lidas" },
          ]
        ).map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 px-4 py-4 transition-colors ${
                isActive
                  ? "border-b-2 border-orange-500 bg-orange-50 font-bold text-slate-900"
                  : "font-semibold text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          );
        })}
        {FEATURES.comments && (
          <button className="flex-1 px-4 py-4 text-center font-semibold leading-tight text-slate-500 hover:text-slate-700">
            Escolha da
            <br />
            Redação
          </button>
        )}
      </nav>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-slate-400">
          Sem artigos para mostrar.
        </p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {items.map((m, i) => (
            <li
              key={m.id}
              className="group flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
            >
              <span className="text-2xl font-black leading-none text-slate-300 transition-colors group-hover:text-patriota-accent">
                {i + 1}
              </span>
              {m.coverImageUrl && (
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      imageVariant(m.coverImageUrl, "small") ??
                      m.coverImageUrl
                    }
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                  />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600">
                  {m.category.name}
                </p>
                <h4 className="mt-1 text-[13px] font-bold leading-snug text-slate-900">
                  <a
                    href={`/artigo/${m.slug}`}
                    className="transition-colors hover:text-patriota-medium"
                  >
                    {m.title}
                  </a>
                </h4>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
