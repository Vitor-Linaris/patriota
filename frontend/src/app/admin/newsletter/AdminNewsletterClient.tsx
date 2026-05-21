"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pagination } from "@/components/category/Pagination";

export interface Subscriber {
  id: string;
  email: string;
  name: string;
  joinedAt: string;
  status: "ativo" | "inativo" | "cancelado";
  segment: string;
}

const STATUS_COLOR: Record<Subscriber["status"], string> = {
  ativo: "bg-green-100 text-green-700",
  inativo: "bg-gray-100 text-gray-500",
  cancelado: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<Subscriber["status"], string> = {
  ativo: "Activo",
  inativo: "Inactivo",
  cancelado: "Cancelado",
};

/**
 * Newsletter admin — simplified to a single concern: the subscriber
 * list. Campaigns / segments were removed because in practice the
 * editor exports the list and runs the campaign on Mailchimp /
 * Sendgrid / Brevo etc. The public footer form (POST
 * /public/newsletter/subscribe) drops new addresses straight into
 * this table.
 */
export default function AdminNewsletterClient({
  initialSubscribers,
  totalSubscribers,
  statsTotal,
  statsAtivo,
  statsCancelado,
  currentPage,
  totalPages,
  searchQuery,
}: {
  initialSubscribers: Subscriber[];
  /** Count matching the current search (drives the "X resultados" text). */
  totalSubscribers: number;
  /** WHOLE-corpus counts — independent of search or page filters. */
  statsTotal: number;
  statsAtivo: number;
  statsCancelado: number;
  currentPage: number;
  totalPages: number;
  searchQuery: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(searchQuery);

  const buildUrl = (updates: {
    q?: string | null;
    page?: number | null;
  }): string => {
    const params = new URLSearchParams();
    const q = updates.q !== undefined ? updates.q : searchQuery;
    const page = updates.page !== undefined ? updates.page : currentPage;
    if (q) params.set("q", q);
    if (page && page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/admin/newsletter?${qs}` : "/admin/newsletter";
  };

  const applySearch = (value: string) => {
    setSearchDraft(value);
    // Reset to page 1 when search changes so the user isn't stuck
    // on page 5 of a result set with only 1 page.
    startTransition(() => {
      router.push(buildUrl({ q: value || null, page: 1 }));
    });
  };

  // The export endpoints are GET — easier to trigger via a regular
  // anchor so the browser handles the file download. The session
  // cookie goes with the request automatically (same-origin).
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8585";
  const csvHref = `${apiBase}/admin/newsletters/subscribers/export.csv`;
  const xlsxHref = `${apiBase}/admin/newsletters/subscribers/export.xlsx`;

  return (
    <main className="bg-[#f6f7fb] p-8">
      {/* HEADER */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0F2C6B]">
            Subscritores da Newsletter
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Lista de e-mails recolhidos pelo formulário público.
            Exporte para usar em Mailchimp, Sendgrid, Brevo ou outras
            plataformas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={csvHref}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:border-[#0F2C6B] hover:text-[#0F2C6B]"
          >
            <span className="text-base">↓</span> Exportar CSV
          </a>
          <a
            href={xlsxHref}
            className="flex items-center gap-2 rounded-xl bg-[#0F2C6B] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1A3A7A]"
          >
            <span className="text-base">↓</span> Exportar Excel
          </a>
        </div>
      </div>

      {/* STATS (whole corpus, never tied to current page or search) */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: "Total de subscritores",
            value: statsTotal,
            color: "text-[#0F2C6B]",
            bg: "bg-white border-gray-100",
          },
          {
            label: "Activos",
            value: statsAtivo,
            color: "text-green-600",
            bg: "bg-green-50 border-green-100",
          },
          {
            label: "Cancelados",
            value: statsCancelado,
            color: "text-red-600",
            bg: "bg-red-50 border-red-100",
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`flex items-center gap-3 rounded-xl border p-4 ${s.bg}`}
          >
            <p className={`text-3xl font-black ${s.color}`}>
              {s.value.toLocaleString("pt-PT")}
            </p>
            <p className="text-sm font-semibold leading-snug text-gray-500">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* SEARCH */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <input
            value={searchDraft}
            onChange={(e) => applySearch(e.target.value)}
            placeholder="Procurar por email ou nome…"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 pl-10 text-sm focus:border-[#0F2C6B] focus:outline-none"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            ⌕
          </span>
        </div>
        <p className="text-sm text-gray-500">
          {totalSubscribers === statsTotal
            ? `${totalSubscribers.toLocaleString("pt-PT")} subscritores`
            : `${totalSubscribers.toLocaleString("pt-PT")} resultados`}
        </p>
      </div>

      {/* LIST */}
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {initialSubscribers.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">
            {searchQuery
              ? `Nenhum subscritor encontrado para "${searchQuery}".`
              : "Ainda não há subscritores. O formulário público vai começar a alimentar esta lista assim que alguém se inscrever."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Subscrito em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {initialSubscribers.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-mono text-[13px] text-gray-800">
                    {s.email}
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {s.name || (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_COLOR[s.status]}`}
                    >
                      {STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{s.joinedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="mt-5">
          <Pagination
            current={currentPage}
            totalPages={totalPages}
            hrefForPage={(page) => buildUrl({ page })}
          />
        </div>
      )}
    </main>
  );
}
