import Image from "next/image";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { adminMediaUrl } from "@/lib/media-preview";
import { UserDropdown } from "./UserDropdown";

interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  role: string;
  permissions: string[];
  avatarUrl: string | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /**
   * Which permission(s) gate this nav item. If `requires` is omitted
   * the item is always visible (Dashboard + Perfil). When more than one
   * permission is listed, ANY one of them is enough.
   */
  requires?: readonly string[];
}

const NAV: readonly NavItem[] = [
  // Dashboard is the safe landing for everyone with admin access.
  { href: "/admin", label: "Dashboard", icon: "▦" },
  {
    href: "/admin/artigos",
    label: "Artigos",
    icon: "▤",
    requires: ["artigos.ler", "artigos.criar"],
  },
  {
    // Sets of articles sold once-off. Sits next to Artigos rather than
    // under Configurações because it is editorial work — choosing what
    // goes together — that happens to have a price on it.
    href: "/admin/pacotes",
    label: "Pacotes",
    icon: "◫",
    requires: ["pacotes.ver"],
  },
  {
    // The queue of what is about to be posted to the newspaper's
    // Facebook and Instagram, and what already was. Next to Artigos
    // because it is the same act seen from the other end — a failure
    // here is an article the audience never heard about.
    href: "/admin/redes",
    label: "Redes sociais",
    icon: "◎",
    requires: ["artigos.publicar"],
  },
  {
    href: "/admin/utilizadores",
    label: "Utilizadores",
    icon: "○",
    requires: ["utilizadores.ver"],
  },
  {
    href: "/admin/permissions",
    label: "Permissões RBAC",
    icon: "⚿",
    requires: ["configuracoes.permissoes"],
  },
  {
    // Reader comments. The comentarios.* permissions already existed in
    // rbac.constants.ts and are granted to EDITOR, REVISOR and MODERADOR.
    href: "/admin/comentarios",
    label: "Comentários",
    icon: "❝",
    requires: ["comentarios.ver"],
  },
  {
    // The public's accounts, as distinct from "Utilizadores", which is
    // the newsroom's. Two different populations, two different screens.
    href: "/admin/leitores",
    label: "Leitores",
    icon: "☺",
    requires: ["leitores.ver"],
  },
  {
    href: "/admin/categorias",
    label: "Categorias",
    icon: "◉",
    requires: ["categorias.ver"],
  },
  {
    href: "/admin/media",
    label: "Media",
    icon: "▣",
    requires: ["media.carregar", "media.editar_metadados"],
  },
  {
    href: "/admin/publicidade",
    label: "Publicidade",
    icon: "◈",
    requires: ["configuracoes.editar"],
  },
  {
    href: "/admin/newsletter",
    label: "Newsletter",
    icon: "✉",
    requires: ["newsletter.listas", "newsletter.enviar"],
  },
  {
    href: "/admin/configuracoes",
    label: "Configurações",
    icon: "⚙",
    requires: ["configuracoes.aceder", "configuracoes.editar"],
  },
];

/** True when the user is allowed to see this nav entry. */
function canSeeNav(item: NavItem, perms: Set<string>): boolean {
  if (!item.requires || item.requires.length === 0) return true;
  return item.requires.some((p) => perms.has(p));
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

export async function AdminShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  const res = await apiFetch("/auth/me");
  const me = (await res.json()) as MeResponse;
  const roleLabel = ROLE_LABEL[me.role] ?? me.role;
  const displayName = me.name ?? me.email;
  const initials = getInitials(me.name, me.email);

  // Filter sidebar entries the user cannot access. SUPER_ADMIN bypasses
  // the check (their permissions list already contains everything, but
  // making it explicit avoids a future regression if perms ever become
  // optional for them).
  const permSet = new Set(me.permissions ?? []);
  const visibleNav =
    me.role === "SUPER_ADMIN"
      ? NAV.slice()
      : NAV.filter((n) => canSeeNav(n, permSet));

  // Same question the sidebar already answers for "Configurações" —
  // reused rather than re-checked, so the dropdown link in
  // UserDropdown can never disagree with whether the sidebar entry is
  // shown. It was shown unconditionally to every role until now.
  const canAccessSettings = visibleNav.some(
    (n) => n.href === "/admin/configuracoes",
  );

  const activeItem = NAV.find((n) => n.href === active);
  const isProfile = active === "/admin/perfil";

  return (
    <div className="flex min-h-screen bg-[#f6f7fb] text-[#101729]">
      {/* Sidebar */}
      <aside className="flex w-[240px] flex-col justify-between bg-patriota-dark text-white">
        <div>
          <div className="px-6 py-7">
            <Image
              src="/brand/Logo-header.svg"
              alt="O Patriota"
              width={132}
              height={54}
              priority
            />
          </div>
          <nav className="mt-2 flex flex-col gap-1 px-3">
            {visibleNav.map((item) => {
              const isActive = item.href === active;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    "flex items-center gap-3 rounded-[8px] px-3 py-2 text-sm transition " +
                    (isActive
                      ? "bg-patriota-accent/15 text-patriota-accent"
                      : "text-white/70 hover:bg-white/5 hover:text-white")
                  }
                >
                  <span aria-hidden className="w-4 text-center text-base">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Nome, cargo e "Terminar sessão" viviam também aqui, em baixo
            — duplicado do menu do avatar no canto superior direito, que
            já tem "Ver perfil" e "Terminar sessão". Removido a pedido do
            cliente; a barra lateral acaba na navegação. */}
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar with avatar dropdown */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
          <div className="flex items-center gap-3 text-sm">
            {activeItem && (
              <>
                <span className="text-gray-300">/</span>
                <span className="font-bold text-[#0F2C6B]">
                  {activeItem.label}
                </span>
              </>
            )}
            {isProfile && (
              <>
                <span className="text-gray-300">/</span>
                <span className="font-bold text-[#0F2C6B]">O meu perfil</span>
              </>
            )}
          </div>
          <UserDropdown
            name={displayName}
            email={me.email}
            roleLabel={roleLabel}
            initials={initials}
            avatarUrl={adminMediaUrl(me.avatarUrl)}
            canAccessSettings={canAccessSettings}
          />
        </header>

        {/* Page content */}
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
