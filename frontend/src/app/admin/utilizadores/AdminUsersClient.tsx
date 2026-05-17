"use client";

import { useState } from "react";

type RoleId =
  | "super_admin"
  | "editor_chefe"
  | "editor"
  | "jornalista"
  | "revisor"
  | "moderador"
  | "analista";

const roleOptions: { id: RoleId; label: string; color: string; desc: string }[] = [
  { id: "super_admin", label: "Super Admin", color: "bg-red-100 text-red-700 border-red-200", desc: "Acesso total" },
  { id: "editor_chefe", label: "Editor-Chefe", color: "bg-purple-100 text-purple-700 border-purple-200", desc: "Gestão editorial completa" },
  { id: "editor", label: "Editor", color: "bg-blue-100 text-blue-700 border-blue-200", desc: "Edição e publicação" },
  { id: "jornalista", label: "Jornalista", color: "bg-green-100 text-green-700 border-green-200", desc: "Criação de conteúdo" },
  { id: "revisor", label: "Revisor", color: "bg-amber-100 text-amber-700 border-amber-200", desc: "Revisão e comentário" },
  { id: "moderador", label: "Moderador", color: "bg-orange-100 text-orange-700 border-orange-200", desc: "Moderação de comentários" },
  { id: "analista", label: "Analista", color: "bg-gray-100 text-gray-600 border-gray-200", desc: "Métricas e relatórios" },
];

interface User {
  id: number;
  name: string;
  email: string;
  role: RoleId;
  initials: string;
  articles: number;
  lastActive: string;
  status: "active" | "inactive" | "suspended";
  joinedDate: string;
}

const initialUsers: User[] = [
  { id: 1, name: "Rui Cardoso", email: "rui.cardoso@opatriota.pt", role: "editor_chefe", initials: "RC", articles: 312, lastActive: "Agora", status: "active", joinedDate: "Jan 2022" },
  { id: 2, name: "Paulo Ferreira", email: "paulo.ferreira@opatriota.pt", role: "editor", initials: "PF", articles: 198, lastActive: "Há 12 min", status: "active", joinedDate: "Mar 2022" },
  { id: 3, name: "Marta Sousa", email: "marta.sousa@opatriota.pt", role: "jornalista", initials: "MS", articles: 87, lastActive: "Há 2h", status: "active", joinedDate: "Set 2023" },
  { id: 4, name: "Ana Lopes", email: "ana.lopes@opatriota.pt", role: "moderador", initials: "AL", articles: 0, lastActive: "Há 28 min", status: "active", joinedDate: "Fev 2024" },
  { id: 5, name: "Sofia Pinto", email: "sofia.pinto@opatriota.pt", role: "revisor", initials: "SP", articles: 23, lastActive: "Há 1h", status: "active", joinedDate: "Jun 2023" },
  { id: 6, name: "Carlos Neves", email: "carlos.neves@opatriota.pt", role: "jornalista", initials: "CN", articles: 54, lastActive: "Há 3h", status: "active", joinedDate: "Nov 2023" },
  { id: 7, name: "Inês Rodrigues", email: "ines.rodrigues@opatriota.pt", role: "jornalista", initials: "IR", articles: 41, lastActive: "Ontem", status: "active", joinedDate: "Jan 2024" },
  { id: 8, name: "Luís Monteiro", email: "luis.monteiro@opatriota.pt", role: "jornalista", initials: "LM", articles: 29, lastActive: "Ontem", status: "inactive", joinedDate: "Abr 2024" },
  { id: 9, name: "Beatriz Faria", email: "beatriz.faria@opatriota.pt", role: "analista", initials: "BF", articles: 0, lastActive: "Há 4h", status: "active", joinedDate: "Out 2023" },
  { id: 10, name: "Miguel Santos", email: "miguel.santos@gmail.com", role: "jornalista", initials: "MS", articles: 3, lastActive: "Há 1 semana", status: "suspended", joinedDate: "Mar 2025" },
];

const statusLabel: Record<User["status"], { label: string; color: string }> = {
  active: { label: "Activo", color: "bg-green-100 text-green-700" },
  inactive: { label: "Inactivo", color: "bg-gray-100 text-gray-500" },
  suspended: { label: "Suspenso", color: "bg-red-100 text-red-700" },
};

export default function AdminUsersClient() {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingRole, setEditingRole] = useState<RoleId | null>(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<RoleId | "all">("all");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<RoleId>("jornalista");

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch =
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole = filterRole === "all" || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const startEdit = (u: User) => {
    setEditingId(u.id);
    setEditingRole(u.role);
  };

  const confirmEdit = (id: number) => {
    if (!editingRole) return;
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, role: editingRole } : u)),
    );
    setEditingId(null);
    setEditingRole(null);
  };

  const getRoleInfo = (roleId: RoleId) =>
    roleOptions.find((r) => r.id === roleId)!;

  return (
    <main className="bg-[#f6f7fb] p-8">
      {/* INVITE MODAL */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowInviteModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-xl font-black text-[#0F2C6B]">
              Convidar utilizador
            </h2>
            <p className="mb-5 text-sm text-gray-500">
              Será enviado um e-mail com link de activação.
            </p>

            <div className="space-y-4">
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
                  {roleOptions.map((r) => (
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
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="flex-1 rounded-lg bg-[#0F2C6B] py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1A3A7A]"
              >
                Enviar convite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAGE HEADER */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0F2C6B]">Utilizadores</h1>
          <p className="mt-1 text-sm text-gray-500">
            {users.length} membros da equipa ·{" "}
            {users.filter((u) => u.status === "active").length} activos
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInviteModal(true)}
          className="shrink-0 rounded-lg bg-[#0F2C6B] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#1A3A7A]"
        >
          + Convidar utilizador
        </button>
      </div>

      {/* ROLE PILLS */}
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilterRole("all")}
          className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${filterRole === "all" ? "border-[#0F2C6B] bg-[#0F2C6B] text-white" : "border-gray-200 bg-white text-gray-500 hover:border-gray-400"}`}
        >
          Todos ({users.length})
        </button>
        {roleOptions.map((r) => {
          const count = users.filter((u) => u.role === r.id).length;
          if (count === 0) return null;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setFilterRole(filterRole === r.id ? "all" : r.id)}
              className={`rounded-full border-2 px-2.5 py-1.5 text-[10px] font-black transition-all ${filterRole === r.id ? `${r.color} border-current` : `${r.color} border-transparent hover:border-current`}`}
            >
              {r.label} ({count})
            </button>
          );
        })}
      </div>

      {/* SEARCH */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4">
        <span className="text-gray-400">🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por nome ou e-mail…"
          className="flex-1 bg-transparent py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="text-xs text-gray-300 hover:text-gray-500"
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
              <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 lg:table-cell">
                Artigos
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 xl:table-cell">
                Último acesso
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
              const st = statusLabel[u.status];
              return (
                <tr key={u.id} className="transition-colors hover:bg-gray-50/50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F2C6B] text-[10px] font-black text-[#FFCC66]">
                        {u.initials}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{u.name}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3.5">
                    {isEditing ? (
                      <select
                        value={editingRole ?? u.role}
                        onChange={(e) => setEditingRole(e.target.value as RoleId)}
                        autoFocus
                        className="rounded-lg border border-[#0F2C6B] bg-white px-2 py-1.5 text-xs font-semibold focus:outline-none"
                      >
                        {roleOptions.map((r) => (
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
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${st.color}`}>
                      {st.label}
                    </span>
                  </td>

                  <td className="hidden px-4 py-3.5 lg:table-cell">
                    <span className="text-sm font-semibold text-gray-700">{u.articles}</span>
                  </td>

                  <td className="hidden px-4 py-3.5 xl:table-cell">
                    <span className="text-xs text-gray-500">{u.lastActive}</span>
                  </td>

                  <td className="hidden px-4 py-3.5 xl:table-cell">
                    <span className="text-xs text-gray-400">{u.joinedDate}</span>
                  </td>

                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditingRole(null);
                            }}
                            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-50"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmEdit(u.id)}
                            className="rounded-lg bg-[#0F2C6B] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1A3A7A]"
                          >
                            Confirmar
                          </button>
                        </>
                      ) : (
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
                            className="rounded-lg border border-gray-100 px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:border-red-200 hover:text-red-600"
                          >
                            ···
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm text-gray-400">
                  Nenhum utilizador encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
