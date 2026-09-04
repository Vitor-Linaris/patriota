"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import type { SuspensionDuration } from "@/components/admin/BanReaderDialog";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Approving or removing a comment changes the PUBLIC article page too, so
 * the article route has to be revalidated as a layout — same pattern as
 * categorias/actions.ts.
 */
async function refresh() {
  revalidatePath("/admin/comentarios");
  revalidatePath("/artigo", "layout");
}

async function post(path: string, body?: unknown): Promise<ActionResult> {
  const res = await apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: data.message ?? "Falha na operação." };
  }
  await refresh();
  return { ok: true as const };
}

export async function approveCommentAction(id: string, note?: string) {
  return post(`/admin/comments/${id}/approve`, note ? { note } : {});
}

/**
 * Soft removal — sets the comment to "Eliminado" with a mandatory reason,
 * which the API also mails to the comment's author. It is NOT permanent:
 * see permanentlyDeleteCommentAction below.
 */
export async function deleteCommentAction(
  id: string,
  reason: string,
): Promise<ActionResult> {
  const res = await apiFetch(`/admin/comments/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: data.message ?? "Falha ao eliminar." };
  }
  await refresh();
  return { ok: true as const };
}

/**
 * Erases the row for good. Only offered from the "Eliminados" tab — the
 * API refuses this on a comment that was not already soft-deleted first.
 */
export async function permanentlyDeleteCommentAction(
  id: string,
): Promise<ActionResult> {
  const res = await apiFetch(`/admin/comments/${id}/permanent`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false as const,
      error: data.message ?? "Falha ao eliminar em definitivo.",
    };
  }
  await refresh();
  return { ok: true as const };
}

/**
 * Bans the reader behind a comment.
 *
 * Revalidates the article layout like every other action here, because a
 * ban that purges comments changes the public page too.
 */
export async function suspendReaderAction(
  readerId: string,
  duration: SuspensionDuration,
  opts: { reason?: string; purgeComments?: boolean } = {},
) {
  return post(`/admin/readers/${readerId}/suspend`, {
    duration,
    ...(opts.reason ? { reason: opts.reason } : {}),
    ...(opts.purgeComments ? { purgeComments: true } : {}),
  });
}

export async function unsuspendReaderAction(
  readerId: string,
): Promise<ActionResult> {
  const res = await apiFetch(`/admin/readers/${readerId}/suspend`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: data.message ?? "Falha ao levantar." };
  }
  await refresh();
  return { ok: true as const };
}

/**
 * Only "APROVADO" is offered from the UI — a bulk "Eliminar" would need
 * one reason per comment, which does not fit a multi-select action, so
 * that stays a per-row flow (see deleteCommentAction).
 */
export async function bulkModerateAction(ids: string[], status: "APROVADO") {
  return post(`/admin/comments/bulk`, { ids, status });
}
