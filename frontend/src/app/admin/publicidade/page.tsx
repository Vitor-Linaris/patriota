import { AdminShell } from "../AdminShell";
import AdminAdsClient from "./AdminAdsClient";
import { apiFetch } from "@/lib/api";
import { mapApiAdToUi, type Ad } from "@/contexts/AdContext";

interface AdApi {
  id: string;
  name: string;
  page: string;
  position: string;
  size: string;
  sizeLabel: string;
  type: "EMPTY" | "IMAGE" | "HTML";
  enabled: boolean;
  imageUrl: string | null;
  linkUrl: string | null;
  linkTarget: string | null;
  altText: string | null;
  htmlCode: string | null;
  updatedAt: string;
}

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
