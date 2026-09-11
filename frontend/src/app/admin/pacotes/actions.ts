"use server";

import { revalidatePath, updateTag } from "next/cache";
import { apiFetch } from "@/lib/api";
import { PACKAGES_TAG } from "@/lib/packages";

export interface PackageFormPayload {
  name?: string;
  slug?: string;
  description?: string;
  coverImageUrl?: string;
  priceCents?: number;
  includedInSubscription?: boolean;
}

/**
 * Every path a pacote can appear on.
 *
 * The storefront and the article pages are included because publishing a
 * pacote publishes articles and flips them to exclusive — the homepage and
 * the pacote pages are stale the instant that happens.
 */
async function refresh(slug?: string) {
  revalidatePath("/admin/pacotes");
  revalidatePath("/pacotes");
  if (slug) revalidatePath(`/pacotes/${slug}`);
  revalidatePath("/");
  // By TAG as well as by path, and the tag is the one that matters: the
  // storefront listing is also read by the reader dashboard's access
  // card, and paths cannot reach a cache entry shared across unrelated
  // routes. Without this, publishing a pacote refreshed /pacotes and left
  // /conta quoting a price from up to five minutes ago — or not showing
  // the new pacote at all.
  //
  // updateTag rather than revalidateTag: this is a Server Action and the
  // caller re-renders immediately after. Same reasoning as the categories
  // admin next door.
  updateTag(PACKAGES_TAG);
}

/** Shared shape: errors come back as data, never thrown. */
async function fail(res: Response, fallback: string) {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: false as const, error: body.message ?? fallback };
}

export async function createPackageAction(payload: PackageFormPayload) {
  const res = await apiFetch("/admin/packages", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) return fail(res, "Falha ao criar o pacote.");
  const created = (await res.json()) as { id: string; slug: string };
  await refresh(created.slug);
  return { ok: true as const, id: created.id };
}

export async function updatePackageAction(
  id: string,
  payload: PackageFormPayload,
) {
  const res = await apiFetch(`/admin/packages/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) return fail(res, "Falha ao guardar o pacote.");
  const updated = (await res.json()) as { slug: string };
  await refresh(updated.slug);
  return { ok: true as const };
}

/**
 * Replaces the whole ordered article list.
 *
 * Nobody's purchase is touched by this — the snapshot of what each buyer
 * paid for lives in another table and is never rewritten. Removing an
 * article here takes it off the storefront for future buyers and takes
 * nothing from anyone who already paid.
 */
export async function setPackageArticlesAction(
  id: string,
  articleIds: string[],
) {
  const res = await apiFetch(`/admin/packages/${id}/articles`, {
    method: "PUT",
    body: JSON.stringify({ articleIds }),
  });
  if (!res.ok) return fail(res, "Falha ao guardar os artigos.");
  await refresh();
  return { ok: true as const };
}

/**
 * Publishes the drafts inside the pacote, makes them exclusive, and puts
 * the pacote on sale.
 *
 * A 403 here usually means the caller has pacotes.publicar but not
 * artigos.publicar; the API's message names the articles that would have
 * been published, so it is passed straight through rather than replaced.
 */
export async function publishPackageAction(id: string) {
  const res = await apiFetch(`/admin/packages/${id}/publish`, {
    method: "POST",
  });
  if (!res.ok) return fail(res, "Falha ao publicar o pacote.");
  await refresh();
  return { ok: true as const };
}

export async function unpublishPackageAction(id: string) {
  const res = await apiFetch(`/admin/packages/${id}/unpublish`, {
    method: "POST",
  });
  if (!res.ok) return fail(res, "Falha ao retirar o pacote de venda.");
  await refresh();
  return { ok: true as const };
}

/** For a pacote already on sale that gained a draft article. */
export async function publishPendingArticlesAction(id: string) {
  const res = await apiFetch(`/admin/packages/${id}/publish-pending`, {
    method: "POST",
  });
  if (!res.ok) return fail(res, "Falha ao publicar os artigos pendentes.");
  await refresh();
  return { ok: true as const };
}

/**
 * Turns already-live, still-free members into exclusives.
 *
 * Deliberately a separate button. Publishing a pacote never does this on
 * its own, because taking a free article out of public view is a decision
 * somebody has to make knowingly.
 */
export async function makeMembersExclusiveAction(id: string) {
  const res = await apiFetch(`/admin/packages/${id}/make-exclusive`, {
    method: "POST",
  });
  if (!res.ok) return fail(res, "Falha ao tornar os artigos exclusivos.");
  await refresh();
  return { ok: true as const };
}

export async function deletePackageAction(id: string) {
  const res = await apiFetch(`/admin/packages/${id}`, { method: "DELETE" });
  if (!res.ok) return fail(res, "Falha ao eliminar o pacote.");
  await refresh();
  return { ok: true as const };
}

export async function revokePurchaseAction(purchaseId: string) {
  const res = await apiFetch(
    `/admin/packages/purchases/${purchaseId}/revoke`,
    { method: "POST" },
  );
  if (!res.ok) return fail(res, "Falha ao revogar a compra.");
  await refresh();
  return { ok: true as const };
}
