"use client";

import { useMemo, useState, useTransition } from "react";
import { savePermissionsAction } from "./actions";

export interface PermissionDef {
  key: string;
  label: string;
  description: string;
}

export interface ModuleDef {
  key: string;
  label: string;
  permissions: PermissionDef[];
}

export interface MatrixData {
  roles: { key: string; label: string }[];
  modules: ModuleDef[];
  totals: { totalPermissions: number; totalModules: number };
  current: Record<string, string[]>;
  counts: Record<string, { granted: number; percent: number }>;
}

const ROLE_COLOR: Record<string, string> = {
  SUPER_ADMIN: "from-orange-500 to-red-500 text-orange-600",
  EDITOR_CHEFE: "from-amber-400 to-yellow-500 text-amber-600",
  EDITOR: "from-blue-500 to-indigo-600 text-blue-600",
  JORNALISTA: "from-cyan-500 to-sky-600 text-cyan-600",
  REVISOR: "from-purple-500 to-fuchsia-600 text-purple-600",
  MODERADOR: "from-teal-500 to-emerald-600 text-teal-600",
  ANALISTA: "from-slate-500 to-slate-600 text-slate-600",
};

const ROLE_TEXT: Record<string, string> = {
  SUPER_ADMIN: "text-orange-600",
  EDITOR_CHEFE: "text-amber-600",
  EDITOR: "text-blue-600",
  JORNALISTA: "text-cyan-600",
  REVISOR: "text-purple-600",
  MODERADOR: "text-teal-600",
  ANALISTA: "text-slate-600",
};

export function PermissionsMatrix({ initial }: { initial: MatrixData }) {
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(
      Object.entries(initial.current).map(([role, perms]) => [
        role,
        new Set(perms),
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const totals = initial.totals;

  const counts = useMemo(() => {
    return Object.fromEntries(
      initial.roles.map(({ key }) => {
        const g = matrix[key]?.size ?? 0;
        return [
          key,
          { granted: g, percent: Math.round((g / totals.totalPermissions) * 100) },
        ];
      }),
    ) as Record<string, { granted: number; percent: number }>;
  }, [matrix, initial.roles, totals.totalPermissions]);

  const isDirty = useMemo(() => {
    return initial.roles.some(({ key }) => {
      const before = new Set(initial.current[key] ?? []);
      const after = matrix[key] ?? new Set<string>();
      if (before.size !== after.size) return true;
      for (const p of before) if (!after.has(p)) return true;
      return false;
    });
  }, [matrix, initial.roles, initial.current]);

  function toggle(role: string, perm: string) {
    if (role === "SUPER_ADMIN") return; // immutable
    setSaved(false);
    setError(null);
    setMatrix((prev) => {
      const next = { ...prev };
      const set = new Set(next[role]);
      if (set.has(perm)) set.delete(perm);
      else set.add(perm);
      next[role] = set;
      return next;
    });
  }

  function onSave() {
    const payload = {
      permissions: Object.fromEntries(
        Object.entries(matrix).map(([role, set]) => [role, Array.from(set)]),
      ),
    };
    startTransition(async () => {
      const result = await savePermissionsAction(payload);
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>Permissões RBAC</span>
        </div>
        <div className="flex items-center gap-3">
          {saved && !isDirty ? (
            <span className="text-xs font-medium text-emerald-600">
              Alterações guardadas
            </span>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || isPending}
            className="rounded-lg bg-patriota-dark px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-patriota-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "A guardar…" : "Guardar alterações"}
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="px-8 py-6">
        <h1 className="text-2xl font-black text-slate-900">Gestão de Permissões</h1>
        <p className="mt-1 text-sm text-slate-500">
          Controlo de acesso por papel (RBAC) — {initial.roles.length} roles ·{" "}
          {totals.totalPermissions} permissões em {totals.totalModules} módulos
        </p>

        {/* Stat cards */}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {initial.roles.map((r) => {
            const c = counts[r.key];
            return (
              <div
                key={r.key}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p
                  className={`text-[11px] font-bold uppercase tracking-wide ${
                    ROLE_TEXT[r.key] ?? "text-slate-600"
                  }`}
                >
                  {r.label}
                </p>
                <p className="mt-1 text-2xl font-black text-slate-900">
                  {c?.percent ?? 0}%
                </p>
                <p className="text-xs text-slate-500">
                  {c?.granted ?? 0}/{totals.totalPermissions} permissões
                </p>
              </div>
            );
          })}
        </div>

        {/* Tip */}
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span aria-hidden className="text-base">💡</span>
          <p>
            <strong>Dica:</strong> ative ou desative permissões clicando nas
            caixas. <strong>Super Admin</strong> tem todas as permissões e está
            bloqueado.
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}

        {/* Matrix */}
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 text-left font-bold">Permissões</th>
                {initial.roles.map((r) => (
                  <th
                    key={r.key}
                    className={`px-3 py-3 text-center font-bold ${
                      ROLE_TEXT[r.key] ?? "text-slate-600"
                    }`}
                  >
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initial.modules.map((mod) => (
                <ModuleRows
                  key={mod.key}
                  mod={mod}
                  roles={initial.roles}
                  matrix={matrix}
                  onToggle={toggle}
                />
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-right text-xs text-slate-500">
          <span className="font-semibold text-orange-600">Super Admin</span>{" "}
          tem permissão total e está bloqueado.
        </p>
      </div>
    </>
  );
}

function ModuleRows({
  mod,
  roles,
  matrix,
  onToggle,
}: {
  mod: ModuleDef;
  roles: { key: string; label: string }[];
  matrix: Record<string, Set<string>>;
  onToggle: (role: string, perm: string) => void;
}) {
  return (
    <>
      <tr className="border-t-4 border-slate-100 bg-slate-50/60">
        <th
          colSpan={1 + roles.length}
          className="px-5 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-700"
        >
          ▼ {mod.label}{" "}
          <span className="font-normal text-slate-400">
            ({mod.permissions.length} permissões)
          </span>
        </th>
      </tr>
      {mod.permissions.map((perm) => (
        <tr key={perm.key} className="border-t border-slate-100 hover:bg-slate-50">
          <td className="px-5 py-3">
            <div className="font-semibold text-slate-800">{perm.label}</div>
            <div className="text-xs text-slate-500">{perm.description}</div>
          </td>
          {roles.map((r) => {
            const checked = matrix[r.key]?.has(perm.key) ?? false;
            const locked = r.key === "SUPER_ADMIN";
            return (
              <td key={r.key} className="px-3 py-3 text-center">
                <button
                  type="button"
                  onClick={() => onToggle(r.key, perm.key)}
                  disabled={locked}
                  aria-pressed={checked}
                  aria-label={`${r.label}: ${perm.label}`}
                  className={
                    "inline-flex h-7 w-7 items-center justify-center rounded-md border transition " +
                    (checked
                      ? "border-patriota-medium bg-patriota-medium text-white shadow-sm"
                      : "border-slate-300 bg-white hover:border-slate-400") +
                    (locked ? " cursor-not-allowed opacity-80" : "")
                  }
                >
                  {checked ? "✓" : ""}
                </button>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
