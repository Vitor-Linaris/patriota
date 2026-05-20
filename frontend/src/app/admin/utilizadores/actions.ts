"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

const FRIENDLY_TO_DB: Record<string, string> = {
  super_admin: "SUPER_ADMIN",
  editor_chefe: "EDITOR_CHEFE",
  editor: "EDITOR",
  jornalista: "JORNALISTA",
  revisor: "REVISOR",
  moderador: "MODERADOR",
  analista: "ANALISTA",
};

export async function inviteUserAction(
  email: string,
  role: string,
  name?: string,
) {
  const dbRole = FRIENDLY_TO_DB[role] ?? role.toUpperCase();
  const res = await apiFetch("/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, role: dbRole, name }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: body.message ?? "Falha." };
  }
  revalidatePath("/admin/utilizadores");
  const created = (await res.json()) as {
    id: string;
    email: string;
    temporaryPassword: string;
  };
  return { ok: true as const, temporaryPassword: created.temporaryPassword };
}

export async function changeUserRoleAction(id: string, role: string) {
  const dbRole = FRIENDLY_TO_DB[role] ?? role.toUpperCase();
  const res = await apiFetch(`/admin/users/${id}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role: dbRole }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: body.message ?? "Falha." };
  }
  revalidatePath("/admin/utilizadores");
  return { ok: true as const };
}

export async function setUserStatusAction(id: string, isActive: boolean) {
  const res = await apiFetch(`/admin/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
  if (!res.ok) return { ok: false as const, error: "Falha." };
  revalidatePath("/admin/utilizadores");
  return { ok: true as const };
}

/**
 * Force-reset another user's password to a freshly generated temporary
 * value. The plaintext is only ever returned here once — the admin
 * must communicate it to the user out-of-band.
 */
export async function resetUserPasswordAction(id: string) {
  const res = await apiFetch(`/admin/users/${id}/reset-password`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false as const,
      error: body.message ?? "Falha ao repor palavra-passe.",
    };
  }
  const created = (await res.json()) as {
    id: string;
    email: string;
    temporaryPassword: string;
  };
  revalidatePath("/admin/utilizadores");
  return { ok: true as const, temporaryPassword: created.temporaryPassword };
}

/**
 * Permanently delete a user. The backend rejects when the user still
 * owns articles (409 with a clear message), surfaces self-delete and
 * cross-hierarchy attempts as 403.
 */
export async function deleteUserAction(id: string) {
  const res = await apiFetch(`/admin/users/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false as const,
      error: body.message ?? "Falha ao eliminar utilizador.",
    };
  }
  revalidatePath("/admin/utilizadores");
  return { ok: true as const };
}
