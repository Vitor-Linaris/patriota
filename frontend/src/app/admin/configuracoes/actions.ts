"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export type SettingsSection =
  | "geral"
  | "email"
  | "seo"
  | "redes"
  | "newsletter"
  | "seguranca";

export async function saveSettingsSectionAction(
  section: SettingsSection,
  data: Record<string, unknown>,
) {
  const res = await apiFetch(`/admin/settings/${section}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: body.message ?? "Falha ao guardar." };
  }
  revalidatePath("/admin/configuracoes");
  return { ok: true as const };
}
