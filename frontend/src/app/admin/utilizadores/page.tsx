import { AdminShell } from "../AdminShell";
import AdminUsersClient from "./AdminUsersClient";

export default function AdminUsersPage() {
  return (
    <AdminShell active="/admin/utilizadores">
      <AdminUsersClient />
    </AdminShell>
  );
}
