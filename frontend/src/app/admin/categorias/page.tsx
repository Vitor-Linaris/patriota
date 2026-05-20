import { AdminShell } from "../AdminShell";
import { apiFetch } from "@/lib/api";
import AdminCategoriesClient, {
  type Category,
} from "./AdminCategoriesClient";

interface BackendCategory extends Category {}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const currentPage = Math.max(1, Number(pageParam) || 1);
  const res = await apiFetch("/admin/categories");
  const initial: BackendCategory[] = res.ok ? await res.json() : [];

  return (
    <AdminShell active="/admin/categorias">
      <AdminCategoriesClient initial={initial} currentPage={currentPage} />
    </AdminShell>
  );
}
