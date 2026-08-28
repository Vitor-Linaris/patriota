"use server";

import { revalidatePath, updateTag } from "next/cache";
import { apiFetch } from "@/lib/api";
import { CATEGORIES_TAG } from "@/lib/categories";

export interface CategoryPayload {
  name: string;
  slug?: string;
  description: string;
  icon: string;
  color: string;
  visible?: boolean;
  parentId?: string | null;
}

export interface SubtopicPayload {
  label: string;
}

async function refresh() {
  // The catalogue is now cached across requests, so this tag is what
  // makes an edit visible at all. It has to come first and it has to be
  // unconditional: the header and footer read the catalogue on EVERY
  // page, and the revalidatePath calls below only cover three of them.
  //
  // updateTag rather than revalidateTag: this is a Server Action and the
  // editor must see the change on the very next render, not on the one
  // after. (revalidateTag's single-argument form is deprecated besides.)
  updateTag(CATEGORIES_TAG);
  revalidatePath("/admin/categorias");
  revalidatePath("/");
  revalidatePath("/categoria", "layout");
}

export async function createCategoryAction(payload: CategoryPayload) {
  const res = await apiFetch(`/admin/categories`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: body.message ?? "Falha ao criar." };
  }
  await refresh();
  return { ok: true as const };
}

export async function updateCategoryAction(
  id: string,
  payload: Partial<CategoryPayload>,
) {
  const res = await apiFetch(`/admin/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: body.message ?? "Falha ao atualizar." };
  }
  await refresh();
  return { ok: true as const };
}

export async function toggleCategoryVisibilityAction(
  id: string,
  visible: boolean,
) {
  return updateCategoryAction(id, { visible });
}

export async function deleteCategoryAction(id: string) {
  const res = await apiFetch(`/admin/categories/${id}`, { method: "DELETE" });
  if (!res.ok) {
    return { ok: false as const, error: "Falha ao eliminar." };
  }
  await refresh();
  return { ok: true as const };
}

/**
 * One move per drop, not the whole tree — see ReorderCategoryDto on the
 * backend for why. The client applies the move optimistically and rolls
 * back on a non-ok result, so the error message matters here.
 */
export async function reorderCategoryAction(payload: {
  id: string;
  parentId: string | null;
  index: number;
}) {
  const res = await apiFetch(`/admin/categories/reorder`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: body.message ?? "Falha ao mover." };
  }
  await refresh();
  return { ok: true as const };
}

export async function addSubtopicAction(
  categoryId: string,
  payload: SubtopicPayload,
) {
  const res = await apiFetch(`/admin/categories/${categoryId}/subtopics`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { ok: false as const, error: "Falha." };
  await refresh();
  return { ok: true as const };
}

export async function removeSubtopicAction(
  categoryId: string,
  subtopicId: string,
) {
  const res = await apiFetch(
    `/admin/categories/${categoryId}/subtopics/${subtopicId}`,
    { method: "DELETE" },
  );
  if (!res.ok) return { ok: false as const, error: "Falha." };
  await refresh();
  return { ok: true as const };
}
