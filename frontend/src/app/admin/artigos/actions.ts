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
  status?: "RASCUNHO" | "AGENDADO" | "PUBLICADO" | "ARQUIVADO";
  premium?: boolean;
  readMinutes?: number;
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
  coverImageUrl?: string;
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
