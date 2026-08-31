"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import type { SuspensionDuration } from "@/components/admin/BanReaderDialog";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Only this page is revalidated, unlike the moderation queue's actions.
 *
 * A ban handed out from here can purge comments, which does change the
 * public article pages — but revalidating /artigo as a layout on every
 * ban would throw away the cache of the entire site to correct at most a
 * handful of pages. The purge already happens through the same service
 * the queue uses, and the article pages pick it up on their next
 * revalidation window. Correctness here is eventual on purpose.
 */
async function refresh() {
  revalidatePath("/admin/leitores");
}

export async function suspendReaderAction(
  readerId: string,
  duration: SuspensionDuration,
  opts: { reason?: string; purgeComments?: boolean } = {},
): Promise<ActionResult> {
  const res = await apiFetch(`/admin/readers/${readerId}/suspend`, {
    method: "POST",
    body: JSON.stringify({
      duration,
      ...(opts.reason ? { reason: opts.reason } : {}),
      ...(opts.purgeComments ? { purgeComments: true } : {}),
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: data.message ?? "Falha ao suspender." };
  }
  await refresh();
  return { ok: true as const };
}

export async function unsuspendReaderAction(
  readerId: string,
): Promise<ActionResult> {
  const res = await apiFetch(`/admin/readers/${readerId}/suspend`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: data.message ?? "Falha ao levantar." };
  }
  await refresh();
  return { ok: true as const };
}

export async function grantSubscriptionAction(
  readerId: string,
  opts: { until?: string; note?: string } = {},
): Promise<ActionResult> {
  const res = await apiFetch(`/admin/readers/${readerId}/subscription`, {
    method: "POST",
    body: JSON.stringify({
      // `until` omitted means no end date. An empty string would fail
      // @IsDateString on the server, which is a worse way to say the
      // same thing.
      ...(opts.until ? { until: new Date(opts.until).toISOString() } : {}),
      ...(opts.note ? { note: opts.note } : {}),
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: data.message ?? "Falha ao oferecer." };
  }
  await refresh();
  return { ok: true as const };
}

export async function revokeSubscriptionAction(
  readerId: string,
): Promise<ActionResult> {
  const res = await apiFetch(`/admin/readers/${readerId}/subscription`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false as const, error: data.message ?? "Falha ao retirar." };
  }
  await refresh();
  return { ok: true as const };
}
