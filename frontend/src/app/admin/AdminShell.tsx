import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "./login/actions";
import { apiFetch } from "@/lib/api";
import { UserDropdown } from "./UserDropdown";

interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  role: string;
  permissions: string[];
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

        <div className="border-t border-white/5 px-4 py-5">
          {/* User card → links to profile */}
          <Link
            href="/admin/perfil"
            className="group flex items-center gap-3 rounded-[8px] bg-white/5 p-2 transition hover:bg-white/10"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-patriota-accent/20 text-sm font-bold text-patriota-accent">
              {initials}
            </div>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm font-semibold text-white">
                {displayName}
              </span>
              <span className="text-[10px] uppercase tracking-[0.5px] text-patriota-accent/80">
                {roleLabel}
              </span>
            </div>
            <span className="text-white/30 transition-colors group-hover:text-white/70">
              ›
            </span>
          </Link>
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="w-full rounded-[8px] border border-white/10 px-3 py-2 text-xs text-white/60 transition hover:border-white/20 hover:text-white"
            >
              Terminar sessão
            </button>
          </form>
        </div>
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
          />
        </header>

        {/* Page content */}
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
