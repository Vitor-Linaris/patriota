"use client";

import { useCallback, useEffect, useState } from "react";

type Network = "FACEBOOK" | "INSTAGRAM";

interface SocialPost {
  id: string;
  network: Network;
  status: "AGENDADO" | "A_ENVIAR" | "ENVIADO" | "FALHOU" | "CANCELADO";
  message: string;
  imageUrl: string | null;
  linkUrl: string;
  scheduledFor: string;
  attempts: number;
  lastError: string | null;
  remoteUrl: string | null;
  sentAt: string | null;
  editable: boolean;
}

const NETWORK_LABEL: Record<Network, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
};

const STATUS_LABEL: Record<SocialPost["status"], string> = {
  AGENDADO: "Agendado",
  A_ENVIAR: "A sair",
  ENVIADO: "Publicado",
  FALHOU: "Falhou",
  CANCELADO: "Cancelado",
};

const STATUS_TONE: Record<SocialPost["status"], string> = {
  AGENDADO: "bg-amber-50 text-amber-700 ring-amber-200",
  A_ENVIAR: "bg-blue-50 text-blue-700 ring-blue-200",
  ENVIADO: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FALHOU: "bg-red-50 text-red-700 ring-red-200",
  CANCELADO: "bg-gray-100 text-gray-500 ring-gray-200",
};

// Europe/Lisbon, stated rather than inherited — the same reason as in
// AdminSocialClient: "sai às 14:32" has to mean 14:32 in the newsroom,
// and the crons that drain the queue are already pinned to it.
const TIME = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "Europe/Lisbon",
  hour: "2-digit",
  minute: "2-digit",
});
const DATE_TIME = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "Europe/Lisbon",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const DAY = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "Europe/Lisbon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * "às 14:32" today, "16 set., 14:32" any other day.
 *
 * "Today" is decided in Lisbon too. Comparing getDate() would ask the
 * viewer's own clock, so at 23:30 UTC a post scheduled for tomorrow
 * morning in Lisbon reads as today to somebody abroad.
 */
function when(iso: string): string {
  const d = new Date(iso);
  const sameDay = DAY.format(d) === DAY.format(new Date());
  return sameDay ? `às ${TIME.format(d)}` : DATE_TIME.format(d);
}

/**
 * What is about to be posted about this article, and the chance to stop
 * it.
 *
 * The client asked for the publish to reach the social accounts by
 * itself, and then for a window to catch a mistake before it does — this
 * card IS that window. It matters more than it looks: the picture on an
 * Instagram post cannot be changed after the fact, and a typo in a
 * headline that went out to the whole audience is not a thing the
 * newsroom can quietly fix.
 *
 * Self-contained, like ArticlePackageField next door: it owns its fetch
 * and its two writes and never travels through the article's own save.
 * The queue is written by a poller a minute after publishing, so this
 * has to be able to show up on its own anyway.
 */
export function ArticleSocialField({ articleId }: { articleId: string }) {
  const [state, setState] = useState<{
    configured: boolean;
    posts: SocialPost[];
  } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A 403 is ordinary rather than a failure — a role without
  // artigos.publicar simply does not see this card — so it resolves to
  // "nothing queued, nothing configured" instead of an error, exactly as
  // ArticlePackageField does next door.
  const load = useCallback(
    () =>
      fetch(`/api/admin/social/artigo/${articleId}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { configured: false, posts: [] }))
        .then(setState)
        .catch(() => setState({ configured: false, posts: [] })),
    [articleId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // The row appears about a minute after the article is published, so a
  // card that only ever loaded once would sit there saying nothing while
  // the newsroom waited. Polling stops as soon as nothing is pending —
  // this is an editor screen people leave open for hours.
  useEffect(() => {
    if (!state) return;
    const pending = state.posts.some(
      (p) => p.status === "AGENDADO" || p.status === "A_ENVIAR",
    );
    if (!pending && state.posts.length > 0) return;
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [state, load]);

  async function save(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/social/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: draft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Falha ao guardar.");
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/social/${id}/cancelar`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Falha ao cancelar.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cancelar.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;

  // Nothing queued and nothing configured: the card would be an empty
  // box with a promise in it. Kept off the screen entirely.
  if (!state.configured && state.posts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="mb-1 text-xs font-black uppercase tracking-wider text-gray-400">
        Redes sociais
      </p>

      {state.posts.length === 0 ? (
        <p className="text-xs leading-relaxed text-gray-400">
          Quando este artigo for publicado, entra automaticamente na fila do
          Facebook e do Instagram. Aparece aqui com tempo para corrigir ou
          cancelar antes de sair.
        </p>
      ) : (
        <ul className="space-y-3">
          {state.posts.map((post) => (
            <li
              key={post.id}
              className="rounded-lg border border-gray-100 bg-gray-50/60 p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-gray-700">
                  {NETWORK_LABEL[post.network]}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ${STATUS_TONE[post.status]}`}
                >
                  {STATUS_LABEL[post.status]}
                </span>
              </div>

              <p className="mt-1 text-[11px] text-gray-500">
                {post.status === "AGENDADO" && `Sai ${when(post.scheduledFor)}`}
                {post.status === "ENVIADO" &&
                  post.sentAt &&
                  `Publicado ${when(post.sentAt)}`}
                {post.status === "FALHOU" &&
                  `Desistiu ao fim de ${post.attempts} tentativas`}
                {post.status === "CANCELADO" && "Travado pela redacção"}
                {post.status === "A_ENVIAR" && "A caminho da rede"}
              </p>

              {editing === post.id ? (
                <div className="mt-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-gray-200 p-2 text-xs focus:border-[#0F2C6B] focus:outline-none"
                  />
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void save(post.id)}
                      className="rounded-lg bg-[#0F2C6B] px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-bold text-gray-500 hover:bg-gray-100"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 whitespace-pre-line text-[11px] leading-snug text-gray-600">
                  {post.message}
                </p>
              )}

              {post.lastError && (
                <p className="mt-1.5 rounded bg-red-50 px-2 py-1 text-[10px] text-red-700">
                  {post.lastError}
                </p>
              )}

              {post.editable && editing !== post.id && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(post.id);
                      setDraft(post.message);
                    }}
                    className="text-[11px] font-bold text-[#0F2C6B] hover:underline"
                  >
                    Editar texto
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancel(post.id)}
                    className="text-[11px] font-bold text-red-600 hover:underline disabled:opacity-50"
                  >
                    Não publicar
                  </button>
                </div>
              )}

              {post.remoteUrl && (
                <a
                  href={post.remoteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-block text-[11px] font-bold text-[#0F2C6B] hover:underline"
                >
                  Ver publicação →
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
