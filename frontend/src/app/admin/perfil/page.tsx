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
  publishingCadence: string | null;
  phone: string | null;
  avatarUrl: string | null;
  notificationPrefs: Record<string, unknown>;
  /** Um interruptor por área do sino — ver StaffNotificationType. */
  staffNotifPrefs: Record<string, unknown>;
  /** O que este papel pode fazer hoje, incluindo overrides feitos em
   *  /admin/permissoes — decide que áreas do sino esta pessoa vê. */
  permissions: string[];
  createdAt: string;
  /**
   * The choices for the cadence dropdown, sent with the profile rather
   * than fetched separately — the settings endpoints need
   * `configuracoes.aceder`, which a JORNALISTA does not have, and every
   * staff account edits this screen. See UsersService.getOwn.
   */
  cadenceOptions: string[];
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  EDITOR_CHEFE: "Editor-Chefe",
  EDITOR: "Editor",
  JORNALISTA: "Colunista",
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
 *
 * Só "Relatório semanal" sobrevive das seis originais. "Novo artigo
 * publicado" e "Relatórios de newsletter" foram removidos — o primeiro
 * nunca teve nenhum consumidor no backend, e o segundo reportaria
 * números que nunca são escritos (ver WeeklyReportService). Fica
 * reservado a quem tem a visão de conjunto — ver `canSeeReports` abaixo.
 */
const DEFAULT_NOTIFS = {
  weeklyReport: true,
};

function toBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * O sino: uma área por permissão, na mesma ordem e com a mesma regra de
 * elegibilidade que StaffNotificationsService.RECIPIENT_PERMISSION no
 * backend. `anyOfPermissions` ausente (só ARTIGO_PUBLICADO) significa
 * "toda a gente vê" — é pessoal, não é sobre gerir uma área.
 *
 * Duplicar esta lista aqui, em vez de a pedir ao backend, foi a escolha
 * mais simples: são nove linhas estáticas, o mesmo texto que o próprio
 * backend já usa nos títulos das notificações, e não vale a pena um
 * pedido extra só para isto.
 */
const STAFF_NOTIF_AREAS: {
  key: string;
  label: string;
  desc: string;
  anyOfPermissions?: string[];
}[] = [
  {
    key: "ARTIGO_REVISAO",
    label: "Artigos para revisão",
    desc: "Quando alguém submeter um artigo para aprovação.",
    anyOfPermissions: ["artigos.aprovar"],
  },
  {
    key: "ARTIGO_PUBLICADO",
    label: "O meu artigo foi publicado",
    desc: "Quando um artigo seu for publicado.",
  },
  {
    key: "PACOTE",
    label: "Pacotes",
    desc: "Quando um pacote for criado ou publicado.",
    anyOfPermissions: ["pacotes.ver"],
  },
  {
    key: "UTILIZADOR",
    label: "Utilizadores",
    desc: "Quando a palavra-passe de alguém for reposta.",
    anyOfPermissions: ["utilizadores.editar"],
  },
  {
    key: "PERMISSOES",
    label: "Permissões",
    desc: "Quando a matriz de permissões (RBAC) for alterada.",
    anyOfPermissions: ["configuracoes.permissoes"],
  },
  {
    key: "COMENTARIO",
    label: "Comentários e leitores",
    desc: "Quando um comentário for eliminado em definitivo, ou um leitor suspenso.",
    anyOfPermissions: ["comentarios.eliminar", "leitores.suspender"],
  },
  {
    key: "CATEGORIA",
    label: "Categorias",
    desc: "Quando uma categoria for criada ou editada.",
    anyOfPermissions: ["categorias.editar"],
  },
  {
    key: "PUBLICIDADE",
    label: "Publicidade",
    desc: "Quando um anúncio for alterado.",
    anyOfPermissions: ["configuracoes.editar"],
  },
  {
    key: "CONFIGURACOES",
    label: "Configurações",
    desc: "Quando uma secção de Configurações for gravada.",
    anyOfPermissions: ["configuracoes.editar"],
  },
];

export default async function Page() {
  // Use /users/me/profile (not /auth/me) — it returns the full row
  // including bio, phone, avatarUrl, notificationPrefs.
  const res = await apiFetch("/users/me/profile");
  const me = (await res.json()) as MeProfile;
  const prefs = me.notificationPrefs ?? {};
  const staffPrefs = me.staffNotifPrefs ?? {};
  const perms = new Set(me.permissions ?? []);

  const staffAreas = STAFF_NOTIF_AREAS.filter(
    (a) => !a.anyOfPermissions || a.anyOfPermissions.some((p) => perms.has(p)),
  ).map((a) => ({
    key: a.key,
    label: a.label,
    desc: a.desc,
    // Ausente = ligado — ver o comentário no schema sobre
    // User.staffNotifPrefs.
    checked: toBool(staffPrefs[a.key], true),
  }));

  return (
    <AdminShell active="/admin/perfil">
      <AdminProfileClient
        initial={{
          name: me.name ?? me.email,
          email: me.email,
          role: ROLE_LABEL[me.role] ?? me.role,
          bio: me.bio ?? "",
          publishingCadence: me.publishingCadence ?? "",
          phone: me.phone ?? "",
          avatarUrl: me.avatarUrl ?? "",
          avatarInitials: getInitials(me.name, me.email),
        }}
        cadenceOptions={me.cadenceOptions ?? []}
        initialNotifs={{
          weeklyReport: toBool(prefs.weeklyReport, DEFAULT_NOTIFS.weeklyReport),
        }}
        // Só Super Admin e Editor-Chefe têm a visão de conjunto que estes
        // dois relatórios servem — o resto da redacção não precisa deles
        // no ecrã, mesmo que a chave continue a existir por baixo.
        canSeeReports={me.role === "SUPER_ADMIN" || me.role === "EDITOR_CHEFE"}
        staffAreas={staffAreas}
      />
    </AdminShell>
  );
}
