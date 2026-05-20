import { AdminShell } from "../AdminShell";
import AdminUsersClient, { type AdminUser } from "./AdminUsersClient";
import { apiFetch } from "@/lib/api";

interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface UserApi {
  id: string;
  email: string;
  name: string | null;
  role:
    | "SUPER_ADMIN"
    | "EDITOR_CHEFE"
    | "EDITOR"
    | "JORNALISTA"
    | "REVISOR"
    | "MODERADOR"
    | "ANALISTA";
  isActive: boolean;
  bio: string | null;
  phone: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

const ROLE_API_TO_UI: Record<UserApi["role"], AdminUser["role"]> = {
  SUPER_ADMIN: "super_admin",
  EDITOR_CHEFE: "editor_chefe",
  EDITOR: "editor",
  JORNALISTA: "jornalista",
  REVISOR: "revisor",
  MODERADOR: "moderador",
  ANALISTA: "analista",
};

function initials(name: string | null, email: string): string {
  const source = (name ?? email).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toAdminUser(u: UserApi): AdminUser {
  return {
    id: u.id,
    name: u.name ?? u.email,
    email: u.email,
    role: ROLE_API_TO_UI[u.role],
    initials: initials(u.name, u.email),
    status: u.isActive ? "active" : "inactive",
    createdAt: u.createdAt,
  };
}

interface MeWithRoles {
  id: string;
  role: UserApi["role"];
  permissions: string[];
  assignableRoles: UserApi["role"][];
}

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [res, meRes] = await Promise.all([
    apiFetch(`/admin/users?page=${page}&pageSize=${PAGE_SIZE}`),
    apiFetch("/auth/me"),
  ]);
  const body = res.ok
    ? ((await res.json()) as PageResult<UserApi>)
    : { items: [], total: 0, page: 1, pageSize: PAGE_SIZE };
  const users = body.items.map(toAdminUser);
  const totalPages = Math.max(1, Math.ceil(body.total / PAGE_SIZE));
  const me = meRes.ok ? ((await meRes.json()) as MeWithRoles) : null;
  const assignableRoles = (me?.assignableRoles ?? []).map(
    (r) => ROLE_API_TO_UI[r],
  );
  const myRole = me ? ROLE_API_TO_UI[me.role] : null;
  const perms = new Set(me?.permissions ?? []);
  const canResetPassword = perms.has("utilizadores.resetar_password");
  const canDelete = perms.has("utilizadores.eliminar");
  return (
    <AdminShell active="/admin/utilizadores">
      <AdminUsersClient
        initialUsers={users}
        totalUsers={body.total}
        currentPage={page}
        totalPages={totalPages}
        assignableRoles={assignableRoles}
        myRole={myRole}
        myUserId={me?.id ?? null}
        canResetPassword={canResetPassword}
        canDelete={canDelete}
      />
    </AdminShell>
  );
}
