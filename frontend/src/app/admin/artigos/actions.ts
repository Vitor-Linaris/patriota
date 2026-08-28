"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

async function refresh() {
  revalidatePath("/admin/artigos");
  revalidatePath("/admin");
  revalidatePath("/");
}

export interface ArticleFormPayload {
  title: string;
  slug?: string;
  summary?: string;
  content?: string;
  categoryId: string;
  status?:
    | "RASCUNHO"
    | "EM_REVISAO"
    | "AGENDADO"
    | "PUBLICADO"
    | "ARQUIVADO";
  exclusive?: boolean;
  readMinutes?: number;
  tags?: string[];
  /** Up to 8 short bullets shown in the yellow "Essencial" box. */
  essentials?: string[];
  /** Up to 4 labelled columns for the "Contexto" box. */
  context?: { columns: { label: string; body: string }[] };
  /** Pull-quote block. */
  pullQuote?: { quote: string; cite: string };
  metaTitle?: string;
  metaDescription?: string;
  coverImageUrl?: string;
  /** ISO 8601 (UTC). Required when status === "AGENDADO". */
  scheduledAt?: string;
}

export async function createArticleAction(payload: ArticleFormPayload) {
  const res = await apiFetch("/admin/articles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: body.message ?? "Falha ao criar." };
  }
  await refresh();
  const created = (await res.json()) as { id: string };
  return { ok: true as const, id: created.id };
}

export async function updateArticleAction(
  id: string,
  payload: Partial<ArticleFormPayload>,
) {
  const res = await apiFetch(`/admin/articles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: body.message ?? "Falha." };
  }
  await refresh();
  return { ok: true as const };
}

export async function publishArticleAction(id: string) {
  const res = await apiFetch(`/admin/articles/${id}/publish`, {
    method: "POST",
  });
  if (!res.ok) return { ok: false as const, error: "Falha ao publicar." };
  await refresh();
  return { ok: true as const };
}

/**
 * Author submits a draft for editorial review. Server may also be
 * reached indirectly when a non-publisher clicks "Publicar" — the
 * backend falls back to submitForReview in that case (defense in
 * depth). This action is the explicit path for journalists.
 */
export async function submitArticleAction(
  id: string,
  payload: { scheduledAt?: string } = {},
) {
  const res = await apiFetch(`/admin/articles/${id}/submit`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false as const,
      error: body.message ?? "Falha ao submeter para revisão.",
    };
  }
  await refresh();
  return { ok: true as const };
}

/**
 * Approver rejects an article from the review queue, optionally
 * leaving a short reason that surfaces both on the article row and in
 * the /admin/activity feed.
 */
export async function rejectArticleAction(id: string, reason?: string) {
  const res = await apiFetch(`/admin/articles/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false as const,
      error: body.message ?? "Falha ao recusar.",
    };
  }
  await refresh();
  return { ok: true as const };
}

export async function archiveArticleAction(id: string) {
  const res = await apiFetch(`/admin/articles/${id}/archive`, {
    method: "POST",
  });
  if (!res.ok) return { ok: false as const, error: "Falha ao arquivar." };
  await refresh();
  return { ok: true as const };
}

export async function deleteArticleAction(id: string) {
  const res = await apiFetch(`/admin/articles/${id}`, { method: "DELETE" });
  if (!res.ok) return { ok: false as const, error: "Falha ao eliminar." };
  await refresh();
  return { ok: true as const };
}
