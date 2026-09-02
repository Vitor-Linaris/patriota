"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export interface SavePayload {
  permissions: Record<string, string[]>; // role -> permission keys
  /** plan -> permission keys. Separate endpoint, separate catalogue. */
  planPermissions?: Record<string, string[]>;
}

/**
 * Save the full RBAC matrix. Sends one PUT per role (SUPER_ADMIN excluded
 * because the backend marks it immutable). Only callable by SUPER_ADMIN.
 */
export async function savePermissionsAction(
  payload: SavePayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const entries = Object.entries(payload.permissions).filter(
    ([role]) => role !== "SUPER_ADMIN",
  );

  for (const [role, permissions] of entries) {
    const res = await apiFetch(`/admin/rbac/role/${role}`, {
      method: "PUT",
      body: JSON.stringify({ permissions }),
    });
    if (!res.ok) {
      let msg = `Falha ao guardar ${role}.`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) msg = body.message;
      } catch {
        /* ignore */
      }
      return { ok: false, error: msg };
    }
  }

  // Plans go to their own endpoint against their own catalogue. Posting
  // them to /role/:role would be rejected as unknown permissions, which
  // is exactly the protection we want and exactly why they are separate.
  for (const [plan, permissions] of Object.entries(
    payload.planPermissions ?? {},
  )) {
    const res = await apiFetch(`/admin/rbac/plan/${plan}`, {
      method: "PUT",
      body: JSON.stringify({ permissions }),
    });
    if (!res.ok) {
      let msg = `Falha ao guardar o plano ${plan}.`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) msg = body.message;
      } catch {
        /* ignore */
      }
      return { ok: false, error: msg };
    }
  }

  revalidatePath("/admin/permissions");
  return { ok: true };
}
