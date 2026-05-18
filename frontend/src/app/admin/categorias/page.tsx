import { AdminShell } from "../AdminShell";
import { apiFetch } from "@/lib/api";
import AdminCategoriesClient, {
  type Category,
} from "./AdminCategoriesClient";

interface BackendCategory extends Category {}

export default async function Page() {
  const res = await apiFetch("/admin/categories");
  const initial: BackendCategory[] = res.ok ? await res.json() : [];

  return (
    <AdminShell active="/admin/categorias">
      <AdminCategoriesClient initial={initial} />
    </AdminShell>
  );
}
