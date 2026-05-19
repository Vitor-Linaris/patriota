"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export interface CampaignPayload {
  subject: string;
  preview?: string;
  segment?: string;
  header?: string;
  body?: string;
  ctaText?: string;
  ctaUrl?: string;
  footer?: string;
  scheduledAt?: string;
}

async function refresh() {
  revalidatePath("/admin/newsletter");
}

export async function createCampaignAction(payload: CampaignPayload) {
  const res = await apiFetch("/admin/newsletters/campaigns", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: body.message ?? "Falha ao criar." };
  }
  const created = (await res.json()) as { id: string };
  await refresh();
  return { ok: true as const, id: created.id };
}

export async function updateCampaignAction(
  id: string,
  payload: CampaignPayload,
) {
  const res = await apiFetch(`/admin/newsletters/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false as const,
      error: body.message ?? "Falha ao guardar.",
    };
  }
  await refresh();
  return { ok: true as const };
}

export async function sendCampaignAction(id: string) {
  const res = await apiFetch(`/admin/newsletters/campaigns/${id}/send`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: body.message ?? "Falha ao enviar." };
  }
  await refresh();
  return { ok: true as const };
}
