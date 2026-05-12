import { AdminShell } from "../AdminShell";
import { apiFetch } from "@/lib/api";
import { PermissionsMatrix, type MatrixData } from "./PermissionsMatrix";

export default async function PermissionsPage() {
  const res = await apiFetch("/admin/rbac/matrix");
  if (!res.ok) {
    return (
      <AdminShell active="/admin/permissions">
        <main className="p-8">
          <h1 className="text-xl font-bold text-red-700">Sem acesso</h1>
          <p className="mt-2 text-sm text-slate-600">
            O seu papel atual não tem permissão para gerir o RBAC. Apenas{" "}
            <strong>Super Admin</strong> pode editar esta página.
          </p>
        </main>
      </AdminShell>
    );
  }

  const data = (await res.json()) as MatrixData;

  return (
    <AdminShell active="/admin/permissions">
      <PermissionsMatrix initial={data} />
    </AdminShell>
  );
}
