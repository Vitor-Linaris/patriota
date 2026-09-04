"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/admin/CopyButton";
import { Pagination } from "@/components/category/Pagination";
import {
  changeUserRoleAction,
  deleteUserAction,
  inviteUserAction,
  resetUserPasswordAction,
  setUserStatusAction,
} from "./actions";

export type RoleId =
  | "super_admin"
  | "editor_chefe"
  | "editor"
  | "jornalista"
  | "revisor"
  | "moderador"
  | "analista";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  initials: string;
  status: "active" | "inactive";
  createdAt: string;
}

const ROLE_OPTIONS: {
  id: RoleId;
  label: string;
  color: string;
  desc: string;
}[] = [
  {
    id: "super_admin",
    label: "Super Admin",
    color: "bg-red-100 text-red-700 border-red-200",
    desc: "Acesso total",
  },
  {
    id: "editor_chefe",
    label: "Editor-Chefe",
    color: "bg-purple-100 text-purple-700 border-purple-200",
    desc: "Gestão editorial completa",
  },
  {
    id: "editor",
    label: "Editor",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    desc: "Edição e publicação",
  },
  {
    id: "jornalista",
    label: "Jornalista",
    color: "bg-green-100 text-green-700 border-green-200",
    desc: "Criação de conteúdo",
  },
  {
    id: "revisor",
    label: "Revisor",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    desc: "Revisão e comentário",
  },
  {
    id: "moderador",
    label: "Moderador",
    color: "bg-orange-100 text-orange-700 border-orange-200",
    desc: "Moderação de comentários",
  },
  {
    id: "analista",
    label: "Analista",
    color: "bg-gray-100 text-gray-600 border-gray-200",
    desc: "Métricas e relatórios",
  },
];

const STATUS_LABEL: Record<
  AdminUser["status"],
  { label: string; color: string }
> = {
  active: { label: "Activo", color: "bg-green-100 text-green-700" },
  inactive: { label: "Inactivo", color: "bg-gray-100 text-gray-500" },
};

// timeZone pinned — see formatToday() in TopBar.tsx for why: this is a
// client component, so a server/browser timezone mismatch here fails
// hydration, not just displays the wrong day.
const dateFmt = new Intl.DateTimeFormat("pt-PT", {
  month: "short",
  year: "numeric",
  timeZone: "Europe/Lisbon",
});

function formatJoined(iso: string): string {
  try {
    return dateFmt.format(new Date(iso));
  } catch {
    return "—";
  }
}

function getRoleInfo(roleId: RoleId) {
  return ROLE_OPTIONS.find((r) => r.id === roleId) ?? ROLE_OPTIONS[3];
}

// Map UI role keys ↔ API role keys for the by-role pill counts.
const UI_TO_API_ROLE = {
  super_admin: "SUPER_ADMIN",
  editor_chefe: "EDITOR_CHEFE",
  editor: "EDITOR",
  jornalista: "JORNALISTA",
  revisor: "REVISOR",
  moderador: "MODERADOR",
  analista: "ANALISTA",
} as const;
type ApiRole = (typeof UI_TO_API_ROLE)[keyof typeof UI_TO_API_ROLE];

export default function AdminUsersClient({
  initialUsers,
  totalUsers,
  currentPage,
  totalPages,
  searchQuery,
  statsTotal,
  statsActive,
  statsByRole,
  assignableRoles,
  myRole,
  myUserId,
  canResetPassword,
  canDelete,
}: {
  initialUsers: AdminUser[];
  totalUsers: number;
  currentPage: number;
  totalPages: number;
  /** Current ?q= from the URL, hydrates the search input. */
  searchQuery: string;
  /** WHOLE-table user count (ignores filters and pagination). */
  statsTotal: number;
  /** WHOLE-table active count. */
  statsActive: number;
  /** WHOLE-table per-role counts. */
  statsByRole: Record<ApiRole, number>;
  /** Roles the current actor is allowed to assign — drives the
   *  invite modal and the role-change dropdown so users never see
   *  options they can't pick. */
  assignableRoles: RoleId[];
  /** Logged-in user's role (for peer-level checks on row actions). */
  myRole: RoleId | null;
  /** Logged-in user's id (so we never hide self-actions). */
  myUserId: string | null;
  /** True when the actor has utilizadores.resetar_password. */
  canResetPassword: boolean;
  /** True when the actor has utilizadores.eliminar. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<RoleId | null>(null);
  // Mirror of the URL ?q= — typing is local, push to URL on Enter/blur.
  const [searchDraft, setSearchDraft] = useState(searchQuery);

  const [showInvite, setShowInvite] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<RoleId>(
    assignableRoles[0] ?? "jornalista",
  );
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invitedPassword, setInvitedPassword] = useState<string | null>(null);

  // Password reset modal: shows the freshly generated temp password
  // once so the admin can copy it. `target` keeps the affected user
  // around for the success-state title.
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  // Delete confirm modal.
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Filter ROLE_OPTIONS to what the actor can actually assign. Used in
  // the invite modal and the row-level "Alterar role" dropdown.
  const assignableRoleOptions = useMemo(
    () => ROLE_OPTIONS.filter((r) => assignableRoles.includes(r.id)),
    [assignableRoles],
  );

  /** True when the current actor can change/suspend this row. */
  const canManageRow = (u: AdminUser): boolean => {
    if (!myRole) return false;
    if (myRole === "super_admin") return true;
    // Same-level peers can't manage each other (server-side guard);
    // hide the buttons too so users don't try and get a 403.
    if (u.role === myRole && u.id !== myUserId) return false;
    return assignableRoles.includes(u.role);
  };

  // Backend has already filtered/paged via ?q=&page=. No client filter.
  const filtered = initialUsers;

  // URL helper that keeps q and page in sync.
  const buildUrl = (updates: { q?: string | null; page?: number | null }) => {
    const params = new URLSearchParams();
    const q = updates.q !== undefined ? updates.q : searchQuery;
    const page = updates.page !== undefined ? updates.page : currentPage;
    if (q) params.set("q", q);
    if (page && page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/admin/utilizadores?${qs}` : "/admin/utilizadores";
  };

  const applySearch = (value: string) => {
    setSearchDraft(value);
    startTransition(() => {
      router.push(buildUrl({ q: value || null, page: 1 }));
    });
  };

  const startEdit = (u: AdminUser) => {
    setEditingId(u.id);
    setEditingRole(u.role);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingRole(null);
  };

  const confirmEdit = (id: string) => {
    if (!editingRole) return;
    startTransition(async () => {
      const res = await changeUserRoleAction(id, editingRole);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      cancelEdit();
      router.refresh();
    });
  };

  const toggleStatus = (u: AdminUser) => {
    const nextActive = u.status !== "active";
    startTransition(async () => {
      const res = await setUserStatusAction(u.id, nextActive);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  };

  const requestResetPassword = (u: AdminUser) => {
    // Open the modal in its "ask first" state. The reset only runs
    // when the admin clicks Confirmar — guards against accidental
    // clicks on the row button.
    setResetTarget(u);
    setResetPassword(null);
    setResetError(null);
  };

  const confirmResetPassword = () => {
    if (!resetTarget) return;
    const target = resetTarget;
    startTransition(async () => {
      const res = await resetUserPasswordAction(target.id);
      if (!res.ok) {
        setResetError(res.error);
        return;
      }
      setResetPassword(res.temporaryPassword);
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    startTransition(async () => {
      const res = await deleteUserAction(deleteTarget.id);
      if (!res.ok) {
        setDeleteError(res.error);
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    });
  };

  const submitInvite = () => {
    if (!newEmail.trim()) {
      setInviteError("E-mail obrigatório.");
      return;
    }
    setInviteError(null);
    startTransition(async () => {
      const res = await inviteUserAction(
        newEmail.trim(),
        newRole,
        newName.trim() || undefined,
      );
      if (!res.ok) {
        setInviteError(res.error);
        return;
      }
      setInvitedPassword(res.temporaryPassword);
      setNewEmail("");
      setNewName("");
      router.refresh();
    });
  };

  const closeInvite = () => {
    setShowInvite(false);
    setInvitedPassword(null);
    setInviteError(null);
    setNewEmail("");
    setNewName("");
  };

  return (
    <main className="bg-[#f6f7fb] p-8">
      {/* INVITE MODAL */}
      {showInvite && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={closeInvite}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {invitedPassword ? (
              <>
                <h2 className="mb-1 text-xl font-black text-[#0F2C6B]">
                  Utilizador criado ✓
                </h2>
                <p className="mb-5 text-sm text-gray-500">
                  Partilhe a palavra-passe temporária com o utilizador. Ele
                  deverá alterá-la no primeiro acesso.
                </p>
                <div className="mb-4 rounded-lg bg-[#F0F2F7] p-4">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Palavra-passe temporária
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <code className="font-mono text-sm font-bold text-[#0F2C6B]">
                      {invitedPassword}
                    </code>
                    <CopyButton value={invitedPassword} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeInvite}
                  className="w-full rounded-lg bg-[#0F2C6B] py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1A3A7A]"
                >
                  Fechar
                </button>
              </>
            ) : (
              <>
                <h2 className="mb-1 text-xl font-black text-[#0F2C6B]">
                  Convidar utilizador
                </h2>
                <p className="mb-5 text-sm text-gray-500">
                  Uma palavra-passe temporária será gerada para o primeiro
                  acesso.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-600">
                      Nome
                    </label>
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Nome do utilizador"
                      className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-[#0F2C6B] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-600">
                      E-mail
                    </label>
                    <input
                      autoFocus
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="nome@email.pt"
                      className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-[#0F2C6B] focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/10"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-600">
                      Role inicial
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {assignableRoleOptions.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setNewRole(r.id)}
                          className={`rounded-lg border-2 px-3 py-2.5 text-left transition-all ${newRole === r.id ? "border-[#0F2C6B] bg-[#F0F2F7]" : "border-gray-100 hover:border-gray-200"}`}
                        >
                          <span
                            className={`mb-0.5 inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-black ${r.color}`}
                          >
                            {r.label}
                          </span>
                          <p className="text-[10px] text-gray-400">{r.desc}</p>
                        </button>
                      ))}
                    </div>
                    {assignableRoleOptions.length === 0 && (
                      <p className="text-xs italic text-gray-400">
                        O seu role não permite criar novos utilizadores.
                      </p>
                    )}
                  </div>
                  {inviteError && (
                    <p className="text-xs font-semibold text-red-600">
                      {inviteError}
                    </p>
                  )}
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={closeInvite}
                    className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={submitInvite}
                    disabled={pending}
                    className="flex-1 rounded-lg bg-[#0F2C6B] py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1A3A7A] disabled:opacity-50"
                  >
                    {pending ? "A criar…" : "Criar utilizador"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0F2C6B]">Utilizadores</h1>
          <p className="mt-1 text-sm text-gray-500">
            {statsTotal} membros da equipa · {statsActive} activos
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInvite(true)}
          className="shrink-0 rounded-lg bg-[#0F2C6B] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#1A3A7A]"
        >
          + Convidar utilizador
        </button>
      </div>

      {/* ROLE COUNT CHIPS — display only, counts come from the
          whole-table stats endpoint so they don't shrink when paging
          or searching. */}
      <div className="mb-5 flex flex-wrap gap-2">
        <span className="rounded-full border border-[#0F2C6B] bg-[#0F2C6B] px-3 py-1.5 text-xs font-bold text-white">
          Total ({statsTotal})
        </span>
        {ROLE_OPTIONS.map((r) => {
          const count = statsByRole[UI_TO_API_ROLE[r.id]] ?? 0;
          if (count === 0) return null;
          return (
            <span
              key={r.id}
              className={`rounded-full border-2 px-2.5 py-1.5 text-[10px] font-black ${r.color} border-transparent`}
            >
              {r.label} ({count})
            </span>
          );
        })}
      </div>

      {/* SEARCH — drives the URL ?q= which the server uses to filter
          the entire users table (not just the current page). */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4">
        <span className="text-gray-400">🔍</span>
        <input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applySearch(searchDraft.trim());
            }
          }}
          onBlur={() => {
            if (searchDraft.trim() !== searchQuery) {
              applySearch(searchDraft.trim());
            }
          }}
          placeholder="Pesquisar por nome ou e-mail (Enter)…"
          className="flex-1 bg-transparent py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        />
        {searchDraft && (
          <button
            type="button"
            onClick={() => applySearch("")}
            className="text-xs text-gray-300 hover:text-gray-500"
            aria-label="Limpar pesquisa"
          >
            ✕
          </button>
        )}
      </div>

      {/* TABLE */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-[#F7F8FA]">
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                Utilizador
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                Role
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 md:table-cell">
                Estado
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 xl:table-cell">
                Membro desde
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((u) => {
              const roleInfo = getRoleInfo(u.role);
              const isEditing = editingId === u.id;
              const st = STATUS_LABEL[u.status];
              return (
                <tr
                  key={u.id}
                  className="transition-colors hover:bg-gray-50/50"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F2C6B] text-[10px] font-black text-[#FFCC66]">
                        {u.initials}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          {u.name}
                        </p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3.5">
                    {isEditing ? (
                      <select
                        value={editingRole ?? u.role}
                        onChange={(e) =>
                          setEditingRole(e.target.value as RoleId)
                        }
                        autoFocus
                        className="rounded-lg border border-[#0F2C6B] bg-white px-2 py-1.5 text-xs font-semibold focus:outline-none"
                      >
                        {assignableRoleOptions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-black ${roleInfo.color}`}
                      >
                        {roleInfo.label}
                      </span>
                    )}
                  </td>

                  <td className="hidden px-4 py-3.5 md:table-cell">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${st.color}`}
                    >
                      {st.label}
                    </span>
                  </td>

                  <td className="hidden px-4 py-3.5 xl:table-cell">
                    <span className="text-xs text-gray-400">
                      {formatJoined(u.createdAt)}
                    </span>
                  </td>

                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-50"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmEdit(u.id)}
                            disabled={pending}
                            className="rounded-lg bg-[#0F2C6B] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1A3A7A] disabled:opacity-50"
                          >
                            Confirmar
                          </button>
                        </>
                      ) : canManageRow(u) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(u)}
                            className="rounded-lg border border-[#0F2C6B]/20 px-2.5 py-1.5 text-xs font-semibold text-[#0F2C6B] transition-colors hover:bg-[#0F2C6B]/5"
                          >
                            Alterar role
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStatus(u)}
                            disabled={pending}
                            className="rounded-lg border border-gray-100 px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:border-amber-200 hover:text-amber-600 disabled:opacity-50"
                          >
                            {u.status === "active" ? "Desactivar" : "Activar"}
                          </button>
                          {canResetPassword && u.id !== myUserId && (
                            <button
                              type="button"
                              onClick={() => requestResetPassword(u)}
                              disabled={pending}
                              className="rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-50"
                              title="Gerar nova palavra-passe temporária"
                            >
                              Repor senha
                            </button>
                          )}
                          {canDelete && u.id !== myUserId && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget(u);
                              }}
                              disabled={pending}
                              className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                              title="Eliminar permanentemente"
                            >
                              Eliminar
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] italic text-gray-300">
                          Sem permissão
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="py-12 text-center text-sm text-gray-400"
                >
                  Nenhum utilizador encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-xs text-gray-400">
          <span>
            Página {currentPage} de {totalPages} · {totalUsers}{" "}
            {totalUsers === 1 ? "utilizador" : "utilizadores"} no total
          </span>
          <Pagination
            current={currentPage}
            totalPages={totalPages}
            hrefForPage={(p) => buildUrl({ page: p })}
            className="flex items-center gap-1 py-0"
          />
        </div>
      </div>

      {/* Password-reset modal: opens with a spinner, then reveals the
          newly generated temp password with a copy button. Closing it
          discards the value — the backend's bcrypt hash is the only
          remaining store. */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setResetTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-black text-[#0F2C6B]">
              Repor palavra-passe
            </h2>
            <p className="mt-1 truncate text-sm text-gray-500">
              {resetTarget.name} · {resetTarget.email}
            </p>

            {/* State machine:
                  • not pending + no result + no error → confirm step
                  • pending → spinner copy
                  • resetPassword set → reveal + copy + close
                  • resetError set → show error + offer retry/close */}

            {!resetPassword && !resetError && !pending && (
              <>
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Tem a certeza? A palavra-passe actual deste utilizador
                  vai ser <strong>invalidada</strong> e substituída por
                  uma temporária. O utilizador perde o acesso até receber
                  a nova senha.
                </p>
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setResetTarget(null)}
                    disabled={pending}
                    className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    // Critical: disable while pending so a double-click
                    // can't fire the action twice. Two parallel
                    // resets would each rotate the password but only
                    // ONE of the plaintext values gets shown — the
                    // user copies one, the DB stored the other, login
                    // fails ("the new password doesn't work"). The
                    // useTransition's pending flag flips the moment
                    // confirmResetPassword runs.
                    onClick={confirmResetPassword}
                    disabled={pending}
                    className="flex-1 rounded-lg bg-[#0F2C6B] py-2.5 text-sm font-bold text-white hover:bg-[#1A3A7A] disabled:opacity-50"
                  >
                    Confirmar reposição
                  </button>
                </div>
              </>
            )}

            {pending && !resetPassword && !resetError && (
              <p className="mt-5 text-sm text-gray-500">
                A gerar nova palavra-passe…
              </p>
            )}

            {resetError && (
              <>
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  {resetError}
                </p>
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="mt-5 w-full rounded-lg bg-[#0F2C6B] py-2.5 text-sm font-bold text-white hover:bg-[#1A3A7A]"
                >
                  Fechar
                </button>
              </>
            )}

            {resetPassword && (
              <>
                <p className="mt-5 text-sm text-gray-600">
                  Partilhe esta palavra-passe temporária. O utilizador
                  deve alterá-la no primeiro acesso.
                </p>
                <div className="mt-4 rounded-lg bg-[#F0F2F7] p-4">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Nova palavra-passe temporária
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <code className="font-mono text-sm font-bold text-[#0F2C6B]">
                      {resetPassword}
                    </code>
                    <CopyButton value={resetPassword} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="mt-5 w-full rounded-lg bg-[#0F2C6B] py-2.5 text-sm font-bold text-white hover:bg-[#1A3A7A]"
                >
                  Fechar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-black text-red-700">
              Eliminar utilizador
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {deleteTarget.name} · {deleteTarget.email}
            </p>
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Esta acção é irreversível. Considere primeiro desactivar
              a conta — só elimine quando tiver a certeza.
            </p>
            {deleteError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {deleteError}
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={pending}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? "A eliminar…" : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
