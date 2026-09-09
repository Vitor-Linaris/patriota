"use client";

import { useEffect, useState, useTransition } from "react";
import { assignArticleToPackageAction } from "./actions";

interface PackageOption {
  id: string;
  name: string;
  status: string;
}

/**
 * The "Pacote" field in the article editor.
 *
 * The article's side of the pacote relationship, and the direction the
 * newsroom actually works in: a journalist writing for a dossier files the
 * piece here and never opens /admin/pacotes.
 *
 * Self-contained on purpose — it owns its fetch and its save, and writes
 * PackageArticle directly rather than travelling through the article's own
 * save. Membership is a row in a join table, not a column on Article, so
 * folding it into the article payload would have meant the article's
 * PATCH quietly rewriting a second table.
 *
 * A single <select>, not a multi-select. The data model allows an article
 * in several pacotes and the multi-select on the pacote screen can put it
 * there — but the case this exists for is one piece written for one
 * dossier. When an article IS in more than one, the field goes read-only
 * and points at the screen that can express it: saving a single value here
 * would silently drop a pacote somebody deliberately chose.
 */
export function ArticlePackageField({
  articleId,
  packages,
  canEdit,
}: {
  /** The saved article. A piece with no id yet has nothing to file. */
  articleId: string;
  /** Empty when the caller lacks pacotes.ver — the field then renders nothing. */
  packages: PackageOption[];
  /** pacotes.editar. Without it the field is visible but read-only. */
  canEdit: boolean;
}) {
  const [current, setCurrent] = useState<{ id: string; name: string }[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let abort = false;
    // A 403 is ordinary rather than a failure — some roles have no
    // pacotes.ver — so it resolves to "in no pacote" instead of an error.
    fetch(`/api/admin/packages/for-article/${articleId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string; name: string }[]) => {
        if (!abort) setCurrent(rows);
      })
      .catch(() => {
        if (!abort) setCurrent([]);
      });
    return () => {
      abort = true;
    };
  }, [articleId]);

  if (packages.length === 0) return null;

  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-gray-500">
        Pacote
      </label>

      {current === null ? (
        <p className="text-xs text-gray-400">A carregar…</p>
      ) : current.length > 1 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900">
          Este artigo está em {current.length} pacotes (
          {current.map((p) => p.name).join(", ")}). Faça a gestão em{" "}
          <code>/admin/pacotes</code>.
        </p>
      ) : (
        <>
          <select
            value={current[0]?.id ?? ""}
            disabled={!canEdit || pending}
            onChange={(e) => {
              const next = e.target.value || null;
              setError(null);
              startTransition(async () => {
                const res = await assignArticleToPackageAction(articleId, next);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                const chosen = packages.find((p) => p.id === next);
                setCurrent(chosen ? [{ id: chosen.id, name: chosen.name }] : []);
              });
            }}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F2C6B] focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
          >
            <option value="">Nenhum</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.status === "PUBLICADO" ? " (à venda)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] leading-snug text-gray-400">
            {canEdit
              ? "Publicar o pacote publica este artigo e torna-o exclusivo."
              : "Sem permissão para alterar o pacote."}
          </p>
        </>
      )}

      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
