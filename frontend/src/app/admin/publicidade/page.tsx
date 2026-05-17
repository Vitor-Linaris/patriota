import { AdminShell } from "../AdminShell";
import AdminAdsClient from "./AdminAdsClient";

export default function Page() {
  return (
    <AdminShell active="/admin/publicidade">
      <AdminAdsClient />
    </AdminShell>
  );
}
