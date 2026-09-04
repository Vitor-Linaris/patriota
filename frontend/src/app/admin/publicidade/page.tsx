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
  if (res.status === 403) {
    return (
      <AdminShell active="/admin/publicidade">
        <main className="bg-[#f6f7fb] p-8">
          <h1 className="text-xl font-bold text-red-600">Sem acesso</h1>
          <p className="mt-2 text-sm text-gray-500">
            O seu papel não tem a permissão <code>configuracoes.editar</code>.
          </p>
        </main>
      </AdminShell>
    );
  }
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
