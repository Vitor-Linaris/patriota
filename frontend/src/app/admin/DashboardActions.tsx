"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  publishArticleAction,
  rejectArticleAction,
} from "./artigos/actions";

/**
 * Buttons shown next to each item in the dashboard's "Artigos a aprovar"
 * list. "Aprovar" publishes immediately; "Recusar" opens a small modal
 * with an optional reason that's logged in the activity feed and shown
 * to the author when they reopen the rejected article.
 */
export function DashboardActions({
  articleId,
  articleTitle,
  canApprove,
}: {
  articleId: string;
  articleTitle: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!canApprove) {
    return (
      <div className="text-[11px] italic text-gray-300">
        Sem permissão para aprovar
      </div>
    );
  }

  const approve = () => {
    startTransition(async () => {
      await publishArticleAction(articleId);
      router.refresh();
    });
  };

  const submitReject = () => {
    const r = reason;
    setOpen(false);
    setReason("");
    startTransition(async () => {
      await rejectArticleAction(articleId, r);
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        {/* "Ver" opens the admin preview in a new tab so the approver
            can read the full article before deciding — without losing
            their place in the queue. */}
        <a
          href={`/admin/artigos/preview/${articleId}`}
          target="_blank"
          rel="noopener"
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-[#0F2C6B]/40 hover:text-[#0F2C6B]"
          title="Pré-visualizar"
        >
          Ver
        </a>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(true)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:border-red-300 hover:text-red-600 disabled:opacity-50"
        >
          Recusar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={approve}
          className="rounded-lg bg-[#0F2C6B] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1A3A7A] disabled:opacity-50"
        >
          Aprovar
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-black text-[#0F2C6B]">
              Recusar artigo
            </h2>
            <p className="mt-1 truncate text-sm text-gray-500">
              “{articleTitle}”
            </p>
            <label className="mt-5 mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
              Motivo (opcional)
            </label>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Ex.: faltam fontes oficiais, título ambíguo, etc."
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
            />
            <p className="mt-1 text-right text-[10px] text-gray-300">
              {reason.length}/500
            </p>
            <p className="mt-3 text-[11px] text-gray-500">
              O artigo volta para os rascunhos do autor com este motivo
              anotado. Acção registada no histórico.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={submitReject}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Recusar artigo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
