"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export interface CategoryPayload {
  name: string;
  slug?: string;
  description: string;
  icon: string;
  color: string;
  visible?: boolean;
}

export interface SubtopicPayload {
  label: string;
}

async function refresh() {
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
