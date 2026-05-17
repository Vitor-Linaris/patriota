import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "./login/actions";
import { apiFetch } from "@/lib/api";

interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "▦" },
  { href: "/admin/artigos", label: "Artigos", icon: "▤" },
  { href: "/admin/utilizadores", label: "Utilizadores", icon: "○" },
  { href: "/admin/permissions", label: "Permissões RBAC", icon: "⚿" },
  { href: "/admin/categories", label: "Categorias", icon: "◉" },
  { href: "/admin/media", label: "Media", icon: "▣" },
  { href: "/admin/newsletter", label: "Newsletter", icon: "✉" },
  { href: "/admin/settings", label: "Configurações", icon: "⚙" },
];

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  EDITOR_CHEFE: "Editor-Chefe",
  EDITOR: "Editor",
  JORNALISTA: "Jornalista",
  REVISOR: "Revisor",
  MODERADOR: "Moderador",
  ANALISTA: "Analista",
};

export async function AdminShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  const res = await apiFetch("/auth/me");
  const me = (await res.json()) as MeResponse;

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
            {NAV.map((item) => {
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
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-patriota-accent/20 text-sm font-bold text-patriota-accent">
              {(me.name ?? me.email).slice(0, 1).toUpperCase()}
            </div>
            <div className="flex flex-1 flex-col leading-tight">
              <span className="text-sm font-semibold text-white">
                {me.name ?? me.email}
              </span>
              <span className="text-[10px] uppercase tracking-[0.5px] text-patriota-accent/80">
                {ROLE_LABEL[me.role] ?? me.role}
              </span>
            </div>
          </div>
          <form action={logoutAction} className="mt-4">
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
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
