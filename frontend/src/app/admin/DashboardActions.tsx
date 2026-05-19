"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archiveArticleAction,
  publishArticleAction,
} from "./artigos/actions";

export function DashboardActions({ articleId }: { articleId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean }>) => {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        // Soft-fail; revalidate so the dashboard refreshes anyway.
      }
      router.refresh();
    });
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => archiveArticleAction(articleId))}
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:border-red-300 hover:text-red-600 disabled:opacity-50"
      >
        Devolver
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => publishArticleAction(articleId))}
        className="rounded-lg bg-[#0F2C6B] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1A3A7A] disabled:opacity-50"
      >
        Aprovar
      </button>
    </div>
  );
}
