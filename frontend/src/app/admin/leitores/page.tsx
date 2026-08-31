import { AdminShell } from "../AdminShell";
import { apiFetch } from "@/lib/api";
import AdminReadersClient, {
  type AdminReader,
  type ReaderStats,
} from "./AdminReadersClient";

const PAGE_SIZE = 20;

const PLANS = ["GRATIS", "PREMIUM"] as const;
const STATUSES = [
  "PENDENTE_VERIFICACAO",
  "ATIVO",
  "SUSPENSO",
  "ANONIMIZADO",
] as const;

export default async function AdminReadersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    plan?: string;
    status?: string;
    suspended?: string;
  }>;
}) {
  const sp = await searchParams;
  const currentPage = Math.max(1, Number(sp.page) || 1);

  // Anything unrecognised in the URL is dropped rather than forwarded:
  // the API would reject it with a 400 and the page would render empty
  // for what is, from the reader's side, a typo in a bookmark.
  const plan = PLANS.includes(sp.plan as (typeof PLANS)[number])
    ? sp.plan
    : undefined;
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number])
    ? sp.status
    : undefined;
  const suspended = sp.suspended === "true" ? "true" : undefined;

  const params = new URLSearchParams({
    page: String(currentPage),
    pageSize: String(PAGE_SIZE),
  });
  if (sp.q) params.set("q", sp.q);
  if (plan) params.set("plan", plan);
  if (status) params.set("status", status);
  if (suspended) params.set("suspended", suspended);

  const [listRes, statsRes, meRes] = await Promise.all([
    apiFetch(`/admin/readers?${params.toString()}`),
    apiFetch("/admin/readers/stats"),
    apiFetch("/auth/me"),
  ]);

  if (!listRes.ok) {
    return (
      <AdminShell active="/admin/leitores">
        <main className="bg-[#f6f7fb] p-8">
          <h1 className="text-xl font-bold text-red-600">Sem acesso</h1>
          <p className="mt-2 text-sm text-gray-500">
            O seu papel não tem a permissão <code>leitores.ver</code>.
          </p>
        </main>
      </AdminShell>
    );
  }

  const list = (await listRes.json()) as {
    items: AdminReader[];
    total: number;
  };
  const stats = statsRes.ok
    ? ((await statsRes.json()) as ReaderStats)
    : ({ total: 0, plan: {}, status: {}, bannedNow: 0 } as ReaderStats);
  const me = meRes.ok
    ? ((await meRes.json()) as { role?: string; permissions?: string[] })
    : {};
  const perms = new Set(me.permissions ?? []);
  const isSuper = me.role === "SUPER_ADMIN";

  return (
    <AdminShell active="/admin/leitores">
      <AdminReadersClient
        items={list.items}
        total={list.total}
        stats={stats}
        currentPage={currentPage}
        pageSize={PAGE_SIZE}
        filters={{
          q: sp.q ?? "",
          plan: plan ?? "",
          status: status ?? "",
          suspended: suspended === "true",
        }}
        canBan={isSuper || perms.has("leitores.suspender")}
        canGrant={isSuper || perms.has("leitores.oferecer_assinatura")}
      />
    </AdminShell>
  );
}
