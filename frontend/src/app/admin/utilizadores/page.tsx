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

export default async function AdminUsersPage() {
  const res = await apiFetch("/admin/users?pageSize=100");
  const users = res.ok
    ? ((await res.json()) as PageResult<UserApi>).items.map(toAdminUser)
    : [];
  return (
    <AdminShell active="/admin/utilizadores">
      <AdminUsersClient initialUsers={users} />
    </AdminShell>
  );
}
