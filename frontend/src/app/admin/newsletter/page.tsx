import { AdminShell } from "../AdminShell";
import AdminNewsletterClient from "./AdminNewsletterClient";

export default function Page() {
  return (
    <AdminShell active="/admin/newsletter">
      <AdminNewsletterClient />
    </AdminShell>
  );
}
