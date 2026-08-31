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

/**
 * The autosave path. Deliberately NOT createArticleAction /
 * updateArticleAction, for two reasons.
 *
 * 1. STATUS. The manual "Guardar rascunho" button sends status:
 *    "RASCUNHO" — which is honest for a draft, but on an article that is
 *    already live it takes it OFF the site. Autosave must never do that,
 *    so it omits `status` entirely: ArticlesService.update() spreads the
 *    DTO into Prisma, so a field that is not sent is a field that is not
 *    touched, and the article stays exactly in whatever state it was.
 *    `scheduledAt` is omitted for the same reason.
 *
 * 2. NO revalidatePath. The other actions invalidate /admin/artigos,
 *    /admin and the public home on every save — right for a save the
 *    author finished, wasteful every few seconds while they are still
 *    typing, when the only page they are looking at is the editor.
 *
 * Errors come back as data, never thrown: a failed autosave must not
 * interrupt someone mid-sentence.
 */
export async function autosaveArticleAction(
  id: string | undefined,
  payload: Omit<Partial<ArticleFormPayload>, "status" | "scheduledAt">,
  /**
   * True when the article is currently on the public site. Its edits go
   * to the draft column instead of the live one, so a correction that
   * nobody finished never reaches readers and never takes the piece
   * down. See ArticlesService.saveDraft.
   */
  isLive = false,
) {
  const res = !id
    ? await apiFetch("/admin/articles", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    : await apiFetch(
        isLive ? `/admin/articles/${id}/draft` : `/admin/articles/${id}`,
        { method: "PATCH", body: JSON.stringify(payload) },
      );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false as const,
      error: body.message ?? "Não foi possível guardar.",
    };
  }

  // POST returns the created row; PATCH returns the updated one. Either
  // way the id is what the caller needs, so the next tick can PATCH
  // instead of creating a second article.
  const saved = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true as const, id: id ?? saved.id };
}

/**
 * Throws away the parked edits. The live article is untouched — this is
 * "forget what I was writing", not "unpublish".
 */
export async function discardDraftAction(id: string) {
  const res = await apiFetch(`/admin/articles/${id}/draft`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false as const,
      error: body.message ?? "Falha ao descartar as alterações.",
    };
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
