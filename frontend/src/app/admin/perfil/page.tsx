import { AdminShell } from "../AdminShell";
import { apiFetch } from "@/lib/api";
import AdminProfileClient from "./AdminProfileClient";

interface MeProfile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  bio: string | null;
  phone: string | null;
  avatarUrl: string | null;
  notificationPrefs: Record<string, unknown>;
  createdAt: string;
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

/**
 * Default notification preferences used when the user hasn't saved
 * any yet. Kept here so the empty JSON field on a fresh account
 * doesn't render as all-off (the previous defaults were friendlier).
 */
const DEFAULT_NOTIFS = {
  newArticle: true,
  comments: true,
  newsletter: false,
  weeklyReport: true,
  systemAlerts: true,
  loginAlerts: true,
};

function toBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export default async function Page() {
  // Use /users/me/profile (not /auth/me) — it returns the full row
  // including bio, phone, avatarUrl, notificationPrefs.
  const res = await apiFetch("/users/me/profile");
  const me = (await res.json()) as MeProfile;
  const prefs = me.notificationPrefs ?? {};

  return (
    <AdminShell active="/admin/perfil">
      <AdminProfileClient
        initial={{
          name: me.name ?? me.email,
          email: me.email,
          role: ROLE_LABEL[me.role] ?? me.role,
          bio: me.bio ?? "",
          phone: me.phone ?? "",
          avatarUrl: me.avatarUrl ?? "",
          avatarInitials: getInitials(me.name, me.email),
        }}
        initialNotifs={{
          newArticle: toBool(prefs.newArticle, DEFAULT_NOTIFS.newArticle),
          comments: toBool(prefs.comments, DEFAULT_NOTIFS.comments),
          newsletter: toBool(prefs.newsletter, DEFAULT_NOTIFS.newsletter),
          weeklyReport: toBool(prefs.weeklyReport, DEFAULT_NOTIFS.weeklyReport),
          systemAlerts: toBool(prefs.systemAlerts, DEFAULT_NOTIFS.systemAlerts),
          loginAlerts: toBool(prefs.loginAlerts, DEFAULT_NOTIFS.loginAlerts),
        }}
      />
    </AdminShell>
  );
}
