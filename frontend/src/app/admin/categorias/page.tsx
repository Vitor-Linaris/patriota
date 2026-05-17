import { AdminShell } from "../AdminShell";
import AdminCategoriesClient from "./AdminCategoriesClient";

export default function Page() {
  return (
    <AdminShell active="/admin/categorias">
      <AdminCategoriesClient />
    </AdminShell>
  );
}
