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

/**
 * Deletes a slot's banner for good — the file included.
 *
 * Deliberately not the same as clearing the field. The library refuses
 * to delete anything still in use, because a photograph is shared; a
 * banner is not, and "the ad you are looking at uses it" is the reason
 * you are deleting it, not a reason to keep it.
 *
 * The server still declines in two cases and says which: an image
 * borrowed from the library (an article may depend on it) and one a
 * second slot still shows. The slot is cleared either way — that part
 * is what was asked for — so the message reports what happened to the
 * FILE, not whether the click worked.
 */
export async function deleteAdImageAction(id: string) {
  const res = await apiFetch(`/admin/ads/${id}/image`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false as const,
      error:
        res.status === 403
          ? "Não tem permissão para eliminar imagens de publicidade."
          : (body.message ?? "Falha ao eliminar."),
    };
  }
  const body = (await res.json()) as {
    fileDeleted: boolean;
    reason: "eliminada" | "biblioteca" | "em_artigo" | "noutro_espaco" | "externa";
  };
  revalidatePath("/admin/publicidade");
  revalidatePath("/");
  return { ok: true as const, ...body };
}
