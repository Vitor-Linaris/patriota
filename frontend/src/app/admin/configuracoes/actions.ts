"use server";

import { revalidatePath, updateTag } from "next/cache";
import { apiFetch } from "@/lib/api";
import { SETTINGS_TAG } from "@/lib/public-api";

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
  // The footer reads the social links on every page of the public site,
  // and they are now cached across requests — without this the change
  // would show in the backoffice and nowhere else.
  updateTag(SETTINGS_TAG);
  return { ok: true as const };
}
