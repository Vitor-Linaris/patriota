"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConnectionStatus } from "./page";

export type SocialStatus =
  | "AGENDADO"
  | "A_ENVIAR"
  | "ENVIADO"
  | "FALHOU"
  | "CANCELADO";

export interface SocialRow {
  id: string;
  network: "FACEBOOK" | "INSTAGRAM";
  status: SocialStatus;
  message: string;
  imageUrl: string | null;
  linkUrl: string;
  scheduledFor: string;
  attempts: number;
  lastError: string | null;
  remoteUrl: string | null;
  sentAt: string | null;
  editable: boolean;
  articleSlug: string;
  articleTitle: string;
}

const STATUS_LABEL: Record<SocialStatus, string> = {
  AGENDADO: "Agendado",
  A_ENVIAR: "A sair",
  ENVIADO: "Publicado",
  FALHOU: "Falhou",
  CANCELADO: "Cancelado",
};

const STATUS_TONE: Record<SocialStatus, string> = {
  AGENDADO: "bg-amber-50 text-amber-700 ring-amber-200",
  A_ENVIAR: "bg-blue-50 text-blue-700 ring-blue-200",
  ENVIADO: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FALHOU: "bg-red-50 text-red-700 ring-red-200",
  CANCELADO: "bg-gray-100 text-gray-500 ring-gray-200",
};

/**
 * Europe/Lisbon, stated rather than inherited.
 *
 * Without it this rendered "12:57" on the server and "09:57" in the
 * browser — the API container runs in UTC and the reader does not — and
 * React tore the whole list down with a hydration mismatch. It is also
 * simply the right answer: the crons that drain this queue are already
 * pinned to Europe/Lisbon, and "sai às 14:32" has to mean 14:32 in the
 * newsroom, not on whatever machine happens to render it.
 */
const DATE_TIME = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "Europe/Lisbon",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default function AdminSocialClient({
  rows,
  status,
}: {
  rows: SocialRow[];
  status: ConnectionStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = rows.filter(
    (r) => r.status === "AGENDADO" || r.status === "A_ENVIAR",
  );
  const done = rows.filter(
    (r) => r.status !== "AGENDADO" && r.status !== "A_ENVIAR",
  );

  async function cancel(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/social/${id}/cancelar`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Falha ao cancelar.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cancelar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-full bg-[#f6f7fb] p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="text-xl font-black text-gray-900">Redes sociais</h1>
        <p className="mt-1 text-sm text-gray-500">
          Cada artigo publicado entra aqui sozinho. Enquanto estiver
          agendado, ainda dá para corrigir o texto ou travá-lo.
        </p>
      </header>

      <ConnectionCard status={status} />

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <Section title="A sair" count={pending.length}>
        {pending.length === 0 ? (
          <Empty>Nada em fila neste momento.</Empty>
        ) : (
          pending.map((row) => (
            <Row
              key={row.id}
              row={row}
              busy={busy === row.id}
              onCancel={() => void cancel(row.id)}
            />
          ))
        )}
      </Section>

      <Section title="Histórico" count={done.length}>
        {done.length === 0 ? (
          <Empty>Ainda não saiu nada.</Empty>
        ) : (
          done.map((row) => <Row key={row.id} row={row} busy={false} />)
        )}
      </Section>
    </main>
  );
}

/**
 * Whether the tokens actually reach Meta.
 *
 * Read on page load rather than behind a button: a wrong token is
 * exactly the failure nobody goes looking for, and the cost of asking is
 * two requests on a screen that is opened rarely.
 */
function ConnectionCard({ status }: { status: ConnectionStatus }) {
  if (!status.configured) {
    return (
      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-bold text-amber-900">
          A ligação às redes sociais não está configurada neste servidor.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-amber-800">
          Falta <code>META_PAGE_ACCESS_TOKEN</code> nas variáveis de ambiente
          da API. As credenciais vivem no servidor e não nesta área — quem
          tem acesso a Configurações veria o token, e um token de Página da
          Meta não expira.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2">
      <StatusTile
        name="Facebook"
        configured={status.facebook.configured}
        ok={status.facebook.ok}
        detail={
          status.facebook.ok
            ? `Página: ${status.facebook.name}`
            : status.facebook.error
        }
      />
      <StatusTile
        name="Instagram"
        configured={status.instagram.configured}
        ok={status.instagram.ok}
        detail={
          status.instagram.ok
            ? `${status.instagram.used} de ${status.instagram.cap} publicações nas últimas 24h`
            : status.instagram.error
        }
      />
    </div>
  );
}

function StatusTile({
  name,
  configured,
  ok,
  detail,
}: {
  name: string;
  configured?: boolean;
  ok?: boolean;
  detail?: string;
}) {
  const tone = !configured
    ? "border-gray-200 bg-white"
    : ok
      ? "border-emerald-200 bg-emerald-50"
      : "border-red-200 bg-red-50";

  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-900">{name}</span>
        <span className="text-xs font-bold text-gray-500">
          {!configured ? "Desligado" : ok ? "Ligado" : "Com erro"}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-gray-600">
        {configured ? detail : "Sem credenciais para esta rede."}
      </p>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-gray-400">
        {title} {count > 0 && <span className="text-gray-300">· {count}</span>}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-400">
      {children}
    </p>
  );
}

function Row({
  row,
  busy,
  onCancel,
}: {
  row: SocialRow;
  busy: boolean;
  onCancel?: () => void;
}) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-gray-700">
          {row.network === "FACEBOOK" ? "Facebook" : "Instagram"}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ${STATUS_TONE[row.status]}`}
        >
          {STATUS_LABEL[row.status]}
        </span>
        <span className="text-[11px] text-gray-400">
          {row.status === "ENVIADO" && row.sentAt
            ? DATE_TIME.format(new Date(row.sentAt))
            : DATE_TIME.format(new Date(row.scheduledFor))}
        </span>
      </div>

      <p className="mt-1.5 text-sm font-bold text-gray-900">
        {row.articleTitle}
      </p>
      <p className="mt-1 whitespace-pre-line text-xs leading-snug text-gray-500">
        {row.message}
      </p>

      {row.lastError && (
        <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {row.lastError}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <a
          href={`/admin/artigos?id=${row.articleSlug}`}
          className="text-[11px] font-bold text-[#0F2C6B] hover:underline"
        >
          Abrir artigo
        </a>
        {row.remoteUrl && (
          <a
            href={row.remoteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-[#0F2C6B] hover:underline"
          >
            Ver publicação →
          </a>
        )}
        {row.editable && onCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="text-[11px] font-bold text-red-600 hover:underline disabled:opacity-50"
          >
            Não publicar
          </button>
        )}
      </div>
    </article>
  );
}
