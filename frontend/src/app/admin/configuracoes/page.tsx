import { AdminShell } from "../AdminShell";
import AdminSettingsClient from "./AdminSettingsClient";

export default function Page() {
  return (
    <AdminShell active="/admin/configuracoes">
      <AdminSettingsClient />
    </AdminShell>
  );
}
