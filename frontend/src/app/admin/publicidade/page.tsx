import { AdminShell } from "../AdminShell";
import AdminAdsClient from "./AdminAdsClient";
import { apiFetch } from "@/lib/api";
import { mapApiAdToUi, type Ad, type AdApi } from "@/lib/ads";

export default async function Page() {
  const [res, meRes] = await Promise.all([
    apiFetch("/admin/ads"),
    // Only to decide whether to offer permanent deletion. The API
    // refuses it regardless of what this page shows.
    apiFetch("/auth/me"),
  ]);
  const initialAds: Ad[] = res.ok
    ? ((await res.json()) as AdApi[]).map(mapApiAdToUi)
    : [];
  const me = meRes.ok
    ? ((await meRes.json()) as { permissions?: string[] })
    : {};
  const canDeleteImage = (me.permissions ?? []).includes(
    "publicidade.eliminar_imagem",
  );
  return (
    <AdminShell active="/admin/publicidade">
      <AdminAdsClient initialAds={initialAds} canDeleteImage={canDeleteImage} />
    </AdminShell>
  );
}
