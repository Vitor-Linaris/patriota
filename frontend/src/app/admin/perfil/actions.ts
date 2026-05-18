"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export interface UpdateProfilePayload {
  name?: string;
  bio?: string;
  phone?: string;
  avatarUrl?: string;
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
  return { ok: true as const };
}
