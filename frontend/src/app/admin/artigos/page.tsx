import { AdminShell } from "../AdminShell";
import AdminArticlesClient from "./AdminArticlesClient";

export default function AdminArticlesPage() {
  return (
    <AdminShell active="/admin/artigos">
      <AdminArticlesClient />
    </AdminShell>
  );
}
