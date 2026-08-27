"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

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

export async function rejectCommentAction(id: string, note?: string) {
  return post(`/admin/comments/${id}/reject`, note ? { note } : {});
}

export async function spamCommentAction(id: string) {
  return post(`/admin/comments/${id}/spam`);
}

export async function deleteCommentAction(id: string): Promise<ActionResult> {
  const res = await apiFetch(`/admin/comments/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: data.message ?? "Falha ao eliminar." };
  }
  await refresh();
  return { ok: true as const };
}

export async function bulkModerateAction(
  ids: string[],
  status: "APROVADO" | "REJEITADO" | "SPAM" | "ELIMINADO",
) {
  return post(`/admin/comments/bulk`, { ids, status });
}
