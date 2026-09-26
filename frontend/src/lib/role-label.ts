/**
 * Portuguese label for a staff Role enum value.
 *
 * The admin already keeps two copies of this map inline (AdminShell,
 * /admin/perfil) — small enough that duplicating it there was never
 * worth a shared file. This third use, on a PUBLIC page, is different:
 * getting a role label wrong on a byline is a reader-facing mistake,
 * not just a cosmetic one in a screen only staff see. Shared here so
 * the article page and the author profile page can't drift apart.
 */
const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Direcção",
  EDITOR_CHEFE: "Editor-Chefe",
  EDITOR: "Editor",
  JORNALISTA: "Jornalista",
  REVISOR: "Revisor",
  MODERADOR: "Moderador",
  ANALISTA: "Analista",
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}
