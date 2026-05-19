"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export interface CreateMediaPayload {
  url: string;
  name?: string;
  width?: number;
  height?: number;
  size?: number;
  mimeType?: string;
}

export async function createMediaAction(payload: CreateMediaPayload) {
  const res = await apiFetch("/admin/media", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: body.message ?? "Falha ao guardar." };
  }
  revalidatePath("/admin/media");
  const created = (await res.json()) as { id: string };
  return { ok: true as const, id: created.id };
}

export async function deleteMediaAction(id: string) {
  const res = await apiFetch(`/admin/media/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false as const,
      error: body.message ?? "Falha ao eliminar.",
    };
  }
  revalidatePath("/admin/media");
  return { ok: true as const };
}
