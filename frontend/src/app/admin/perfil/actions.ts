"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { apiBaseUrl } from "@/lib/api-base";

const SESSION_COOKIE = "patriota_session";

export interface UpdateProfilePayload {
  name?: string;
  bio?: string;
  phone?: string;
  avatarUrl?: string;
  notificationPrefs?: Record<string, boolean>;
}

export async function updateProfileAction(payload: UpdateProfilePayload) {
  const res = await apiFetch("/users/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: body.message ?? "Falha." };
  }
  revalidatePath("/admin/perfil");
  revalidatePath("/admin", "layout");
  return { ok: true as const };
}

/**
 * Avatar upload — talks to the dedicated /users/me/avatar endpoint
 * (NOT /admin/media/upload) so the photo lands in /uploads/avatars/
 * and is never registered in the shared media library. Each user's
 * profile photo stays private to that user.
 */
export async function uploadAvatarAction(
  formData: FormData,
): Promise<
  | { ok: true; avatarUrl: string }
  | { ok: false; error: string }
> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Ficheiro obrigatório." };
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect("/admin/login");

  const out = new FormData();
  out.append("file", file, file.name);

  const res = await fetch(`${apiBaseUrl()}/users/me/avatar`, {
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
  revalidatePath("/admin/perfil");
  revalidatePath("/admin", "layout");
  const data = (await res.json()) as { avatarUrl: string };
  return { ok: true, avatarUrl: data.avatarUrl };
}

/**
 * Changing the password ends every session opened with the old one —
 * including this one. The backend bumps User.tokenVersion and the token
 * in this cookie stops verifying, so the cookie is dropped here rather
 * than left to produce a puzzling 401 on whatever the person clicks
 * next. They sign in again with the new password, which is also the
 * clearest possible confirmation that it took.
 */
export async function changePasswordAction(current: string, next: string) {
  const res = await apiFetch("/users/me/password", {
    method: "POST",
    body: JSON.stringify({ current, next }),
  });
  if (!res.ok) {
    if (res.status === 401)
      return { ok: false as const, error: "Palavra-passe atual incorreta." };
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: body.message ?? "Falha." };
  }
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return { ok: true as const, signedOut: true as const };
}
