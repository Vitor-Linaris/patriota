import { AdminShell } from "../AdminShell";
import { apiFetch } from "@/lib/api";
import AdminSocialClient, { type SocialRow, type SocialStatus } from "./AdminSocialClient";

/**
 * Publicação automática nas redes sociais — a fila e o histórico.
 *
 * The reason this screen exists at all: everything else about this
 * feature happens without anybody watching. A cron claims the article, a
 * cron posts it, and if Meta refuses — an expired token, a quota spent,
 * a rejected image — the only trace is a line in a log nobody reads. The
 * newsroom would find out weeks later, from the silence on its own
 * Facebook page.
 *
 * So: what is about to go out, what went out and where to, and what
 * failed and why, on one screen.
 */
export default async function Page() {
  const [queueRes, statusRes] = await Promise.all([
    apiFetch("/admin/social"),
    apiFetch("/admin/social/estado"),
  ]);

  if (queueRes.status === 403) {
    return (
      <AdminShell active="/admin/redes">
        <main className="bg-[#f6f7fb] p-8">
          <h1 className="text-xl font-bold text-red-600">Sem acesso</h1>
          <p className="mt-2 text-sm text-gray-500">
            O seu papel não tem a permissão <code>artigos.publicar</code>.
          </p>
        </main>
      </AdminShell>
    );
  }

  const rows = (await queueRes.json()) as SocialRow[];
  const status = statusRes.ok
    ? ((await statusRes.json()) as ConnectionStatus)
    : { configured: false, facebook: {}, instagram: {} };

  return (
    <AdminShell active="/admin/redes">
      <AdminSocialClient rows={rows} status={status} />
    </AdminShell>
  );
}

export interface ConnectionStatus {
  configured: boolean;
  facebook: {
    configured?: boolean;
    ok?: boolean;
    name?: string;
    error?: string;
  };
  instagram: {
    configured?: boolean;
    ok?: boolean;
    used?: number;
    cap?: number;
    error?: string;
  };
}

export type { SocialRow, SocialStatus };
