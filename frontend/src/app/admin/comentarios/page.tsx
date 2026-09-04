import { AdminShell } from "../AdminShell";
import { apiFetch } from "@/lib/api";
import AdminCommentsClient, {
  type ModerationComment,
  type CommentStats,
} from "./AdminCommentsClient";

const STATUSES = ["PENDENTE", "APROVADO", "REJEITADO", "SPAM"] as const;

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
