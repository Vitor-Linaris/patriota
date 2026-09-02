"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { apiBaseUrl } from "@/lib/api-base";

const SESSION_COOKIE = "patriota_session";

export interface CreateMediaPayload {
  url: string;
  name?: string;
  width?: number;
  height?: number;
  size?: number;
  mimeType?: string;
}

export interface UploadedMedia {
  id: string;
  url: string;
  urlMedium: string | null;
  urlSmall: string | null;
  name: string;
  width: number | null;
  height: number | null;
  size: number | null;
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

/**
 * Multipart-aware upload server action. We can't use `apiFetch` (it
 * forces Content-Type: application/json), so we inline the cookie +
 * redirect logic here. Returns the persisted Media row with all three
 * variant URLs.
 */
export async function uploadMediaFileAction(
  formData: FormData,
  /**
   * PUBLICIDADE keeps the file out of the newsroom library. Defaults to
   * the library, which is both the common case and the safe one: a file
   * wrongly IN the library can be seen and moved, one wrongly outside
   * it is invisible to everybody.
   */
  purpose: "EDITORIAL" | "PUBLICIDADE" = "EDITORIAL",
): Promise<
  | { ok: true; media: UploadedMedia }
  | { ok: false; error: string }
> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Ficheiro obrigatório." };
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect("/admin/login");

  // Re-pack into a fresh FormData so we don't accidentally forward
  // form fields that came from the page (Next sometimes adds a
  // $ACTION_REF_ field — we keep only the file).
  const out = new FormData();
  out.append("file", file, file.name);

  const url = new URL(`${apiBaseUrl()}/admin/media/upload`);
  if (purpose !== "EDITORIAL") url.searchParams.set("purpose", purpose);

  const res = await fetch(url, {
    method: "POST",
    body: out,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) redirect("/admin/login");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false,
      error: body.message ?? `Upload falhou (HTTP ${res.status}).`,
    };
  }
  revalidatePath("/admin/media");
  const media = (await res.json()) as UploadedMedia;
  return { ok: true, media };
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
