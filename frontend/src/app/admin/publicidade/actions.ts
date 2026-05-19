"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export type AdTypeApi = "EMPTY" | "IMAGE" | "HTML";

export interface UpdateAdPayload {
  type?: AdTypeApi;
  enabled?: boolean;
  imageUrl?: string | null;
  linkUrl?: string | null;
  linkTarget?: string | null;
  altText?: string | null;
  htmlCode?: string | null;
}

export async function updateAdAction(id: string, patch: UpdateAdPayload) {
  const res = await apiFetch(`/admin/ads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false as const,
      error: body.message ?? "Falha ao guardar.",
    };
  }
  revalidatePath("/admin/publicidade");
  revalidatePath("/");
  return { ok: true as const };
}
