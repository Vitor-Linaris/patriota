import { AdminShell } from "../AdminShell";
import AdminAdsClient from "./AdminAdsClient";
import { apiFetch } from "@/lib/api";
import { mapApiAdToUi, type Ad, type AdApi } from "@/lib/ads";

export default async function Page() {
  const res = await apiFetch("/admin/ads");
  const initialAds: Ad[] = res.ok
    ? ((await res.json()) as AdApi[]).map(mapApiAdToUi)
    : [];
  return (
    <AdminShell active="/admin/publicidade">
      <AdminAdsClient initialAds={initialAds} />
    </AdminShell>
  );
}
