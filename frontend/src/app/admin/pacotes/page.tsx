import { AdminShell } from "../AdminShell";
import AdminPackagesClient from "./AdminPackagesClient";
import { apiFetch } from "@/lib/api";
import type { AdminPackage, PackagePurchaseRow } from "./types";

interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export default async function Page() {
  const [listRes, meRes] = await Promise.all([
    apiFetch("/admin/packages?pageSize=100"),
    apiFetch("/auth/me"),
  ]);

  if (listRes.status === 403) {
    return (
      <AdminShell active="/admin/pacotes">
        <main className="bg-[#f6f7fb] p-8">
          <h1 className="text-xl font-bold text-red-600">Sem acesso</h1>
          <p className="mt-2 text-sm text-gray-500">
            O seu papel não tem a permissão <code>pacotes.ver</code>.
          </p>
        </main>
      </AdminShell>
    );
  }

  const list = listRes.ok
    ? ((await listRes.json()) as PageResult<AdminPackage>)
    : { items: [], total: 0, page: 1, pageSize: 100 };
  const me = meRes.ok
    ? ((await meRes.json()) as { permissions?: string[]; role?: string })
    : {};
  const perms = new Set(me.permissions ?? []);
  const has = (p: string) => me.role === "SUPER_ADMIN" || perms.has(p);

  // Purchases are a separate permission, so the tab is fetched only when
  // the caller may see it — asking anyway would 403 and add a round-trip
  // for a panel that will not render.
  const canSeePurchases = has("pacotes.ver_compras");
  const purchases = canSeePurchases
    ? await apiFetch("/admin/packages/purchases?pageSize=50")
        .then((r) =>
          r.ok
            ? (r.json() as Promise<PageResult<PackagePurchaseRow>>)
            : { items: [], total: 0, page: 1, pageSize: 50 },
        )
        .catch(() => ({ items: [], total: 0, page: 1, pageSize: 50 }))
    : null;

  return (
    <AdminShell active="/admin/pacotes">
      <AdminPackagesClient
        initialPackages={list.items}
        initialPurchases={purchases?.items ?? []}
        can={{
          create: has("pacotes.criar"),
          edit: has("pacotes.editar"),
          publish: has("pacotes.publicar"),
          remove: has("pacotes.eliminar"),
          seePurchases: canSeePurchases,
          revoke: has("pacotes.revogar_compra"),
          // The API refuses a cascade publish without this even when
          // pacotes.publicar is held — showing it here lets the editor
          // know before they click rather than after.
          publishArticles: has("artigos.publicar"),
        }}
      />
    </AdminShell>
  );
}
