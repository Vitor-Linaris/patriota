import { AdminShell } from "../AdminShell";
import { apiFetch } from "@/lib/api";
import AdminCommentsClient, {
  type ModerationComment,
  type CommentStats,
} from "./AdminCommentsClient";

// REJEITADO/SPAM dropped — see the comment on TABS in
// AdminCommentsClient.tsx.
const STATUSES = ["PENDENTE", "APROVADO", "ELIMINADO"] as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  const { status, page: pageParam, q } = await searchParams;
  const currentPage = Math.max(1, Number(pageParam) || 1);
  const active = STATUSES.includes(status as (typeof STATUSES)[number])
    ? (status as (typeof STATUSES)[number])
    : "PENDENTE";

  const params = new URLSearchParams({
    status: active,
    page: String(currentPage),
    pageSize: "20",
  });
  if (q) params.set("q", q);

  const [listRes, statsRes, meRes] = await Promise.all([
    apiFetch(`/admin/comments?${params.toString()}`),
    apiFetch("/admin/comments/stats"),
    // Only to decide whether to draw the ban control. The API enforces
    // leitores.suspender regardless of what the page renders.
    apiFetch("/auth/me"),
  ]);

  if (listRes.status === 403) {
    return (
      <AdminShell active="/admin/comentarios">
        <main className="bg-[#f6f7fb] p-8">
          <h1 className="text-xl font-bold text-red-600">Sem acesso</h1>
          <p className="mt-2 text-sm text-gray-500">
            O seu papel não tem a permissão <code>comentarios.ver</code>.
          </p>
        </main>
      </AdminShell>
    );
  }
  const list = listRes.ok
    ? ((await listRes.json()) as { items: ModerationComment[]; total: number })
    : { items: [], total: 0 };
  const stats = statsRes.ok
    ? ((await statsRes.json()) as CommentStats)
    : ({} as CommentStats);
  const me = meRes.ok
    ? ((await meRes.json()) as { role?: string; permissions?: string[] })
    : {};
  const isSuperAdmin = me.role === "SUPER_ADMIN";
  const canBan =
    isSuperAdmin || (me.permissions ?? []).includes("leitores.suspender");
  const canModerate =
    isSuperAdmin || (me.permissions ?? []).includes("comentarios.aprovar");
  const canDelete =
    isSuperAdmin || (me.permissions ?? []).includes("comentarios.eliminar");

  return (
    <AdminShell active="/admin/comentarios">
      <AdminCommentsClient
        items={list.items}
        total={list.total}
        stats={stats}
        activeStatus={active}
        currentPage={currentPage}
        query={q ?? ""}
        canBan={canBan}
        canModerate={canModerate}
        canDelete={canDelete}
      />
    </AdminShell>
  );
}
