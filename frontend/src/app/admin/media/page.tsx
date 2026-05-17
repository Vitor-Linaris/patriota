import { AdminShell } from "../AdminShell";
import AdminMediaClient from "./AdminMediaClient";

export default function Page() {
  return (
    <AdminShell active="/admin/media">
      <AdminMediaClient />
    </AdminShell>
  );
}
