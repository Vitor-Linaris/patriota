import { AdminShell } from "../AdminShell";
import { apiFetch } from "@/lib/api";
import AdminProfileClient from "./AdminProfileClient";

interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  EDITOR_CHEFE: "Editor-Chefe",
  EDITOR: "Editor",
  JORNALISTA: "Jornalista",
  REVISOR: "Revisor",
  MODERADOR: "Moderador",
  ANALISTA: "Analista",
};

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join("");
  }
  return email.slice(0, 2).toUpperCase();
}

export default async function Page() {
  const res = await apiFetch("/auth/me");
  const me = (await res.json()) as MeResponse;

  return (
    <AdminShell active="/admin/perfil">
      <AdminProfileClient
        initial={{
          name: me.name ?? me.email,
          email: me.email,
          role: ROLE_LABEL[me.role] ?? me.role,
          bio: "",
          phone: "",
          avatarUrl: "",
          avatarInitials: getInitials(me.name, me.email),
        }}
      />
    </AdminShell>
  );
}
