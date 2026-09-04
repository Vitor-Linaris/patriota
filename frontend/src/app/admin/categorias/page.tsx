import { AdminShell } from "../AdminShell";
import { apiFetch } from "@/lib/api";
import AdminCategoriesClient from "./AdminCategoriesClient";
import type { TreeNode } from "./tree-utils";

export default async function Page() {
  // The nested forest, hidden categories included — this is the CMS view,
  // not the public menu.
  const [res, meRes] = await Promise.all([
    apiFetch("/admin/categories/tree"),
    apiFetch("/auth/me"),
  ]);
  if (res.status === 403) {
    return (
      <AdminShell active="/admin/categorias">
        <main className="bg-[#f6f7fb] p-8">
          <h1 className="text-xl font-bold text-red-600">Sem acesso</h1>
          <p className="mt-2 text-sm text-gray-500">
            O seu papel não tem a permissão <code>categorias.ver</code>.
          </p>
        </main>
      </AdminShell>
    );
  }
  if (!res.ok) {
    console.error(
      `[admin/categorias] /admin/categories/tree falhou: ${res.status}`,
    );
  }
  const initial: TreeNode[] = res.ok ? await res.json() : [];
  const me = meRes.ok
    ? ((await meRes.json()) as { role?: string; permissions?: string[] })
    : null;
  const isSuperAdmin = me?.role === "SUPER_ADMIN";
  const perms = new Set(me?.permissions ?? []);
  const canCreate = isSuperAdmin || perms.has("categorias.criar");
  const canEdit = isSuperAdmin || perms.has("categorias.editar");
  const canDelete = isSuperAdmin || perms.has("categorias.eliminar");

  return (
    <AdminShell active="/admin/categorias">
      <AdminCategoriesClient
        initial={initial}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </AdminShell>
  );
}
