import { AdminShell } from "../AdminShell";
import { apiFetch } from "@/lib/api";
import AdminCategoriesClient from "./AdminCategoriesClient";
import type { TreeNode } from "./tree-utils";

export default async function Page() {
  // The nested forest, hidden categories included — this is the CMS view,
  // not the public menu.
  const res = await apiFetch("/admin/categories/tree");
  if (!res.ok) {
    console.error(
      `[admin/categorias] /admin/categories/tree falhou: ${res.status}`,
    );
  }
  const initial: TreeNode[] = res.ok ? await res.json() : [];

  return (
    <AdminShell active="/admin/categorias">
      <AdminCategoriesClient initial={initial} />
    </AdminShell>
  );
}
