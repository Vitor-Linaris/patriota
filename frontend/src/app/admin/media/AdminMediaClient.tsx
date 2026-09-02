"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/admin/CopyButton";
import { Pagination } from "@/components/category/Pagination";
import {
  isVideoUpload,
  validateImageUpload,
  validateVideoUpload,
} from "@/lib/upload-limits";
import {
  createMediaAction,
  deleteMediaAction,
  uploadMediaFileAction,
} from "./actions";

export interface MediaItem {
  id: string;
  /** Where to load the preview from — proxied while the file is private. */
  url: string;
  /** The real address. What gets copied, and what an article points at. */
  canonicalUrl?: string;
  visibility?: "PRIVADO" | "PUBLICO";
  /** Frame count on an animation. The stored format is WebP either way,
   *  so the mime type cannot tell a GIF from a photograph. */
  frames?: number | null;
  /** IMAGEM or VIDEO. The mime type cannot say: a video is stored
   *  alongside a WebP poster and the row carries the poster's type. */
  kind?: "IMAGEM" | "VIDEO";
  /** Length in seconds, on a video. */
  durationSeconds?: number | null;
  /** The still taken from the video. What the grid tile shows. */
  posterUrl?: string | null;
  name: string;
  uploadedAt: string;
  size?: string;
  dimensions?: string;
  /** Number of articles referencing this media (cover or inline). */
  articleCount?: number;
  /** Number of ad slots referencing this media. */
  adCount?: number;
  /** Places using this media (first 5). Mix of articles and ads —
   *  the `kind` discriminator drives the link target in the UI. */
  usedIn?: Array<
    | { kind: "article"; id: string; slug: string; title: string }
    | { kind: "ad"; id: string; title: string }
  >;
  /** Owner's name. Only ever filled in the whole-team view — in your
   *  own library every row would say your own name. */
  uploadedBy?: string | null;
}

/** Bytes as a person reads them. GB matters here: the allowance is 2. */
function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Seconds as m:ss, the way a player shows them. */
function humanDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseDimensions(text: string): { width?: number; height?: number } {
  const match = text.trim().match(/^(\d+)\s*[×x]\s*(\d+)$/i);
  if (!match) return {};
  return { width: Number(match[1]), height: Number(match[2]) };
}

export default function AdminMediaClient({
  initialItems,
  totalItems,
  statsTotal,
  quota,
  currentPage,
  totalPages,
  searchQuery,
  scope,
  canSeeAll,
}: {
  initialItems: MediaItem[];
  /** Items in the CURRENT page + search filter. */
  totalItems: number;
  /** Whole-library count, ignoring search. */
  statsTotal: number;
  /** Always the CALLER's own allowance, even in the whole-team view —
   *  a quota belongs to a person, and there is no such thing as the
   *  team's. */
  quota: { used: number; limit: number; remaining: number } | null;
  currentPage: number;
  totalPages: number;
  searchQuery: string;
  /** Whose library is on screen. */
  scope: "minha" | "todas";
  /** Whether "toda a equipa" is on offer at all — SUPER_ADMIN only. */
  canSeeAll: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [searchDraft, setSearchDraft] = useState(searchQuery);
  const [filter, setFilter] = useState<"todas" | "usadas" | "nao-usadas">(
    "todas",
  );

  const buildUrl = (updates: {
    q?: string | null;
    page?: number | null;
    scope?: "minha" | "todas";
  }) => {
    const params = new URLSearchParams();
    const q = updates.q !== undefined ? updates.q : searchQuery;
    const page = updates.page !== undefined ? updates.page : currentPage;
    const nextScope = updates.scope ?? scope;
    if (q) params.set("q", q);
    if (page && page > 1) params.set("page", String(page));
    if (nextScope === "todas") params.set("scope", "todas");
    const qs = params.toString();
    return qs ? `/admin/media?${qs}` : "/admin/media";
  };

  const applySearch = (value: string) => {
    setSearchDraft(value);
    startTransition(() => {
      router.push(buildUrl({ q: value || null, page: 1 }));
    });
  };
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadUrl, setUploadUrl] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadDimensions, setUploadDimensions] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Direct-file upload. Validates client-side (mime + size), then sends
   * the file. On success, refreshes the page so the new item appears
   * in the grid.
   *
   * Two paths, and the split is not cosmetic. An image goes through the
   * Server Action, as it always has. A video CANNOT: Server Actions are
   * capped at 12 MB by next.config.ts, and over it Next aborts with an
   * error that says nothing about size. So video posts to a Route
   * Handler, which has no such cap. See app/api/admin/media/video.
   */
  const uploadFile = (file: File | null | undefined) => {
    if (!file) return;
    const video = isVideoUpload(file);
    const reason = video ? validateVideoUpload(file) : validateImageUpload(file);
    if (reason) {
      setUploadError(reason);
      return;
    }
    setUploadError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);

      if (video) {
        const res = await fetch("/api/admin/media/video", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            message?: string;
          };
          setUploadError(
            body.message ?? `O envio falhou (HTTP ${res.status}).`,
          );
          return;
        }
      } else {
        const res = await uploadMediaFileAction(fd);
        if (!res.ok) {
          setUploadError(res.error);
          return;
        }
      }

      setUploadOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  };

  // Helper: total references = articles + ad slots. An image is
  // "in use" when this is > 0.
  const totalUsageOf = (m: MediaItem) =>
    (m.articleCount ?? 0) + (m.adCount ?? 0);

  // Search is server-driven (?q=). The "usadas/nao-usadas" filter is
  // still client-side on the current page (backend doesn't filter by
  // usage yet) — adequate at our scale since one page is bounded.
  const filtered = useMemo(() => {
    return initialItems.filter((item) => {
      const isUsed = totalUsageOf(item) > 0;
      const matchFilter =
        filter === "todas"
          ? true
          : filter === "usadas"
            ? isUsed
            : !isUsed;
      return matchFilter;
    });
  }, [initialItems, filter]);

  // "Total" comes from the whole-library count (statsTotal). The
  // usadas / naoUsadas split is page-scoped (the backend doesn't
  // aggregate usage across the whole table yet) — labelled as such
  // in the UI to set expectations.
  const stats = useMemo(() => {
    const usadasOnPage = initialItems.filter(
      (i) => totalUsageOf(i) > 0,
    ).length;
    return {
      total: statsTotal,
      usadas: usadasOnPage,
      naoUsadas: Math.max(0, initialItems.length - usadasOnPage),
    };
  }, [initialItems, statsTotal]);

  const addFromUrl = () => {
    const url = uploadUrl.trim();
    if (!url) {
      setUploadError("URL obrigatório.");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setUploadError("Use um URL http(s).");
      return;
    }
    setUploadError(null);
    const dims = parseDimensions(uploadDimensions);
    startTransition(async () => {
      const res = await createMediaAction({
        url,
        name: uploadName.trim() || undefined,
        width: dims.width,
        height: dims.height,
      });
      if (!res.ok) {
        setUploadError(res.error);
        return;
      }
      setUploadUrl("");
      setUploadName("");
      setUploadDimensions("");
      setUploadOpen(false);
      router.refresh();
    });
  };

  // Centralises navigation from any usage link in the media library.
  // We close the modal + detail panel BEFORE pushing so that the next
  // paint doesn't carry over stale UI state, and we use router.push
  // (not <a>) so the back button restores the library page with a
  // clean React tree instead of a stuck overlay.
  //
  // For articles we deep-link to the specific editor (?edit=<id>).
  // For ads we send the user to /admin/publicidade (the slot list) —
  // there are only ~11 slots total, the user finds the relevant one
  // at a glance, and we don't have a deep-link param for ads yet.
  const openUsageTarget = (
    entry:
      | { kind: "article"; id: string }
      | { kind: "ad"; id: string },
  ) => {
    setDeleteConfirm(null);
    setSelected(null);
    startTransition(() => {
      if (entry.kind === "article") {
        router.push(`/admin/artigos?edit=${entry.id}`);
      } else {
        router.push(`/admin/publicidade`);
      }
    });
  };

  const deleteItem = (id: string) => {
    startTransition(async () => {
      const res = await deleteMediaAction(id);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      if (selected?.id === id) setSelected(null);
      setDeleteConfirm(null);
      router.refresh();
    });
  };

  return (
    <main className="bg-[#f6f7fb] p-8">
      {/* UPLOAD MODAL — file dropzone first, URL paste as fallback.
          Mirrors the article cover picker so authors get a consistent
          upload flow across the admin. */}
      {uploadOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setUploadOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-black text-[#0F2C6B]">
                  Adicionar imagem
                </h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  Arraste um ficheiro ou clique para escolher
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 p-6">
              {/* Dropzone — same UX as the cover picker. */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setUploadDragOver(true);
                }}
                onDragLeave={() => setUploadDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setUploadDragOver(false);
                  uploadFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed ${
                  uploadDragOver
                    ? "border-[#0F2C6B] bg-[#0F2C6B]/5"
                    : "border-gray-200 bg-gray-50"
                } transition-colors hover:border-[#0F2C6B] hover:bg-[#0F2C6B]/5`}
              >
                <span className="text-3xl text-gray-300">↑</span>
                <p className="text-sm font-semibold text-gray-600">
                  {pending
                    ? "A enviar…"
                    : "Arraste um ficheiro ou clique para escolher"}
                </p>
                <p className="text-[10px] leading-relaxed text-gray-400">
                  Imagem: JPG, PNG, WebP, AVIF — até 10 MB, processada em
                  3 variantes WebP. GIF animado até 11 MB e 300
                  fotogramas, e a animação é mantida.
                  <br />
                  Vídeo: MP4 (H.264) ou WebM — até 100 MB, 5 minutos e
                  1920×1080. A miniatura é tirada automaticamente.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/mp4,video/webm"
                className="hidden"
                onChange={(e) => uploadFile(e.target.files?.[0])}
              />

              {uploadError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  {uploadError}
                </p>
              )}

              {/* External URL — kept as a collapsible fallback for
                  importing images that live on third-party CDNs. */}
              <details className="rounded-lg border border-gray-100 px-3 py-2">
                <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  …ou importar URL externo
                </summary>
                <div className="mt-3 space-y-3">
                  <input
                    value={uploadUrl}
                    onChange={(e) => setUploadUrl(e.target.value)}
                    placeholder="https://exemplo.com/foto.jpg"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs focus:border-[#0F2C6B] focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={uploadName}
                      onChange={(e) => setUploadName(e.target.value)}
                      placeholder="Nome (opcional)"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-[#0F2C6B] focus:outline-none"
                    />
                    <input
                      value={uploadDimensions}
                      onChange={(e) => setUploadDimensions(e.target.value)}
                      placeholder="1920×1080 (opcional)"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-[#0F2C6B] focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addFromUrl}
                    disabled={pending}
                    className="w-full rounded-lg border border-[#0F2C6B]/20 py-2 text-xs font-bold text-[#0F2C6B] hover:bg-[#0F2C6B]/5 disabled:opacity-50"
                  >
                    {pending ? "A guardar…" : "Adicionar URL"}
                  </button>
                </div>
              </details>

              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {deleteConfirm &&
        (() => {
          const target = initialItems.find((i) => i.id === deleteConfirm);
          const articleCount = target?.articleCount ?? 0;
          const adCount = target?.adCount ?? 0;
          const totalUses = articleCount + adCount;
          const inUse = totalUses > 0;
          const usedInList = target?.usedIn ?? [];
          const remaining = totalUses - usedInList.length;
          // Build a friendly summary: "2 artigos e 1 publicidade".
          const summaryParts: string[] = [];
          if (articleCount > 0)
            summaryParts.push(
              `${articleCount} ${articleCount === 1 ? "artigo" : "artigos"}`,
            );
          if (adCount > 0)
            summaryParts.push(
              `${adCount} ${adCount === 1 ? "publicidade" : "publicidades"}`,
            );
          const summary = summaryParts.join(" e ");
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              onClick={() => setDeleteConfirm(null)}
            >
              <div
                className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="mb-2 font-black text-gray-800">
                  {inUse
                    ? "Não é possível eliminar"
                    : "Eliminar imagem?"}
                </p>
                {inUse ? (
                  <>
                    <p className="mb-3 text-sm text-gray-600">
                      Esta imagem está a ser usada em{" "}
                      <strong>{summary}</strong>. Remova-a antes de
                      eliminar.
                    </p>
                    {usedInList.length > 0 && (
                      <div className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                          Locais a editar
                        </p>
                        <ul className="space-y-1 text-[12px]">
                          {usedInList.map((entry) => (
                            <li
                              key={`${entry.kind}-${entry.id}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="line-clamp-1 text-amber-900">
                                <span className="mr-1.5 inline-block rounded bg-amber-200/70 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-amber-800">
                                  {entry.kind === "article"
                                    ? "Artigo"
                                    : "Publicidade"}
                                </span>
                                {entry.title}
                              </span>
                              <button
                                type="button"
                                onClick={() => openUsageTarget(entry)}
                                className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-300 hover:bg-amber-100"
                              >
                                {entry.kind === "article"
                                  ? "Editar →"
                                  : "Ver →"}
                              </button>
                            </li>
                          ))}
                          {remaining > 0 && (
                            <li className="text-[11px] italic text-amber-700">
                              (e mais {remaining} …)
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    <div className="flex">
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(null)}
                        className="flex-1 rounded-xl bg-[#0F2C6B] py-2.5 text-sm font-bold text-white hover:bg-[#1A3A7A]"
                      >
                        Entendi
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mb-4 text-sm text-gray-500">
                      Esta acção não pode ser desfeita. A imagem será
                      removida da biblioteca e dos ficheiros do servidor.
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(null)}
                        className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-500"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteItem(deleteConfirm)}
                        disabled={pending}
                        className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}

      {/* HEADER */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0F2C6B]">
            Biblioteca de Média
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {stats.total} imagens · {stats.usadas} usadas em artigos ·{" "}
            {stats.naoUsadas} sem uso
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-[#0F2C6B] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1A3A7A]"
        >
          <span className="text-lg leading-none">+</span> Adicionar imagem
        </button>
      </div>

      {/* STATS */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          {
            label: "Total de imagens",
            value: stats.total,
            color: "text-[#0F2C6B]",
            bg: "bg-white border-gray-100",
          },
          {
            label: "Usadas em artigos",
            value: stats.usadas,
            color: "text-green-600",
            bg: "bg-green-50 border-green-100",
          },
          {
            label: "Sem utilização",
            value: stats.naoUsadas,
            color: "text-amber-600",
            bg: "bg-amber-50 border-amber-100",
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`flex items-center gap-3 rounded-xl border p-4 ${s.bg}`}
          >
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs font-semibold leading-snug text-gray-500">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* STORAGE.
          Shown all the time, not only when it is nearly full: somebody
          should watch it fill rather than meet it at the moment an
          upload is refused. */}
      {quota && (
        <div className="mb-5 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="font-semibold text-gray-500">
              O seu espaço
              {scope === "todas" && (
                // The list may be showing everyone, but this number
                // never is.
                <span className="ml-1 font-normal text-gray-400">
                  (só o seu, mesmo nesta vista)
                </span>
              )}
            </span>
            <span
              className={
                quota.used / quota.limit > 0.9
                  ? "font-bold text-red-600"
                  : "text-gray-600"
              }
            >
              {humanBytes(quota.used)} de {humanBytes(quota.limit)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${
                quota.used / quota.limit > 0.9
                  ? "bg-red-500"
                  : quota.used / quota.limit > 0.7
                    ? "bg-amber-500"
                    : "bg-[#0F2C6B]"
              }`}
              style={{
                width: `${Math.min(100, (quota.used / quota.limit) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* FILTERS + SEARCH */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Whose library. Server-driven, unlike the usage filter beside
            it — this one changes the query, not just what is hidden on
            the page already. Offered to the SUPER_ADMIN alone; the API
            refuses scope=todas to everyone else regardless of what the
            page renders. */}
        {canSeeAll && (
          <div className="flex items-center divide-x divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {(
              [
                { key: "minha", label: "A minha" },
                { key: "todas", label: "Toda a equipa" },
              ] as const
            ).map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() =>
                  router.push(buildUrl({ scope: s.key, page: 1 }))
                }
                className={`whitespace-nowrap px-4 py-2.5 text-xs font-bold transition-colors ${scope === s.key ? "bg-[#0F2C6B] text-white" : "text-gray-500 hover:bg-gray-50"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center divide-x divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {(
            [
              { key: "todas", label: "Todas", count: stats.total },
              { key: "usadas", label: "Usadas", count: stats.usadas },
              { key: "nao-usadas", label: "Sem uso", count: stats.naoUsadas },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`whitespace-nowrap px-4 py-2.5 text-xs font-bold transition-colors ${filter === f.key ? "bg-[#0F2C6B] text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              {f.label}
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] ${filter === f.key ? "bg-white/20" : "bg-gray-100 text-gray-400"}`}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4">
          <span className="text-sm text-gray-400">🔍</span>
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
            placeholder="Pesquisar por nome de ficheiro (Enter)…"
            className="flex-1 bg-transparent py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
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
      </div>

      {/* GRID + DETAIL */}
      <div className="flex gap-5">
        <div className={`${selected ? "flex-1" : "w-full"} transition-all`}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white py-20">
              <span className="text-4xl text-gray-200">🖼</span>
              <p className="font-semibold text-gray-400">
                Nenhuma imagem encontrada
              </p>
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="text-sm font-bold text-[#0F2C6B] underline"
              >
                Adicionar imagem
              </button>
            </div>
          ) : (
            <div
              className={`grid gap-3 ${selected ? "grid-cols-2 xl:grid-cols-3" : "grid-cols-3 md:grid-cols-4 xl:grid-cols-5"}`}
            >
              {filtered.map((item) => {
                const count = totalUsageOf(item);
                const used = count > 0;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() =>
                      setSelected(selected?.id === item.id ? null : item)
                    }
                    className={`group relative aspect-video overflow-hidden rounded-xl border-2 bg-gray-100 text-left transition-all ${selected?.id === item.id ? "border-[#0F2C6B] shadow-lg" : "border-transparent hover:border-gray-300"}`}
                  >
                    {/* A video's tile is its poster. Never the video
                        itself: a grid of <video> elements would have
                        the browser opening a connection per tile. */}
                    {item.kind === "VIDEO" && !item.posterUrl ? (
                      <div className="flex h-full w-full items-center justify-center bg-gray-200 text-2xl text-gray-400">
                        ▶
                      </div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      /* media-proxy-ok: page.tsx maps both of these
                         through mediaPreviewUrl before handing them
                         down, so they already point at the proxy. */
                      <img
                        src={
                          item.kind === "VIDEO" && item.posterUrl
                            ? item.posterUrl
                            : item.url
                        }
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                    {item.kind === "VIDEO" && (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 pl-0.5 text-xs text-white">
                          ▶
                        </span>
                      </span>
                    )}
                    <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/30" />
                    <div
                      className={`absolute right-2 top-2 flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-bold ${used ? "bg-green-500 text-white" : "bg-gray-300 text-white"}`}
                      title={
                        used
                          ? `Em uso em ${count} ${count === 1 ? "artigo" : "artigos"}`
                          : "Sem uso"
                      }
                    >
                      <span className="h-2 w-2 rounded-full bg-white" />
                      {used ? count : "0"}
                    </div>

                    {/* Bottom-left, out of the way of the usage badge.
                        Both say something the thumbnail cannot: a still
                        frame of an animation looks like a photograph,
                        and a private file looks like any other. */}
                    <div className="absolute bottom-2 left-2 flex gap-1">
                      {item.kind === "VIDEO" && (
                        <span
                          title="Vídeo"
                          className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
                        >
                          {item.durationSeconds
                            ? humanDuration(item.durationSeconds)
                            : "vídeo"}
                        </span>
                      )}
                      {(item.frames ?? 0) > 1 && (
                        <span
                          title={`Animação com ${item.frames} fotogramas`}
                          className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
                        >
                          gif
                        </span>
                      )}
                      {item.visibility === "PRIVADO" && (
                        <span
                          title="Só você a vê. Fica pública ao ser usada num artigo publicado."
                          className="rounded bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
                        >
                          privada
                        </span>
                      )}
                    </div>

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <p className="truncate text-[10px] font-semibold text-white">
                        {item.name}
                      </p>
                    </div>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 transition-all hover:border-[#0F2C6B] hover:bg-[#0F2C6B]/5"
              >
                <span className="text-2xl text-gray-300">+</span>
                <span className="text-[10px] font-semibold text-gray-400">
                  Adicionar
                </span>
              </button>
            </div>
          )}
        </div>

        {/* DETAIL PANEL */}
        {selected && (
          <div className="sticky top-4 h-fit w-72 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="aspect-video overflow-hidden bg-gray-100">
              {selected.kind === "VIDEO" ? (
                <video
                  key={selected.id}
                  // media-proxy-ok: proxied in page.tsx, as above.
                  src={selected.url}
                  poster={selected.posterUrl ?? undefined}
                  controls
                  preload="metadata"
                  className="h-full w-full bg-black object-contain"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                /* media-proxy-ok: proxied in page.tsx, as above. */
                <img
                  src={selected.url}
                  alt={selected.name}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="p-4">
              <div className="mb-4 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-800">
                    {selected.name}
                  </p>
                  <p className="mt-0.5 text-[10px] text-gray-400">
                    {selected.uploadedAt}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="shrink-0 text-gray-300 hover:text-gray-500"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4 space-y-2">
                {selected.dimensions && (
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-gray-400">
                      Dimensões
                    </span>
                    <span className="font-mono text-gray-700">
                      {selected.dimensions}
                    </span>
                  </div>
                )}
                {selected.durationSeconds != null && (
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-gray-400">Duração</span>
                    <span className="font-mono text-gray-700">
                      {humanDuration(selected.durationSeconds)}
                    </span>
                  </div>
                )}
                {selected.size && (
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-gray-400">Tamanho</span>
                    <span className="text-gray-700">{selected.size}</span>
                  </div>
                )}
                {/* Only in the whole-team view — in your own library
                    every row would carry your own name. */}
                {scope === "todas" && (
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-gray-400">
                      Enviado por
                    </span>
                    <span className="text-gray-700">
                      {selected.uploadedBy ?? (
                        // Staff who have left. The file outlives the
                        // account on purpose — articles still use it.
                        <em className="text-gray-400">sem dono</em>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Usage block — same "title + action" pattern as the
                  delete modal. Surfaces both article and ad references
                  so the admin can navigate to either context. */}
              {(() => {
                const articleCount = selected.articleCount ?? 0;
                const adCount = selected.adCount ?? 0;
                const totalUses = articleCount + adCount;
                const list = selected.usedIn ?? [];
                const remaining = totalUses - list.length;
                if (totalUses === 0) {
                  return (
                    <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                      Esta imagem não está em uso.
                    </div>
                  );
                }
                const summaryParts: string[] = [];
                if (articleCount > 0)
                  summaryParts.push(
                    `${articleCount} ${articleCount === 1 ? "artigo" : "artigos"}`,
                  );
                if (adCount > 0)
                  summaryParts.push(
                    `${adCount} ${adCount === 1 ? "publicidade" : "publicidades"}`,
                  );
                return (
                  <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-green-700">
                      Em uso em {summaryParts.join(" e ")}
                    </p>
                    <ul className="space-y-1 text-[12px]">
                      {list.map((entry) => (
                        <li
                          key={`${entry.kind}-${entry.id}`}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="line-clamp-1 text-green-900">
                            <span className="mr-1.5 inline-block rounded bg-green-200/70 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-green-800">
                              {entry.kind === "article"
                                ? "Artigo"
                                : "Publicidade"}
                            </span>
                            {entry.title}
                          </span>
                          <button
                            type="button"
                            onClick={() => openUsageTarget(entry)}
                            className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-700 ring-1 ring-green-300 hover:bg-green-100"
                          >
                            {entry.kind === "article" ? "Editar →" : "Ver →"}
                          </button>
                        </li>
                      ))}
                      {remaining > 0 && (
                        <li className="text-[11px] italic text-green-700">
                          (e mais {remaining} …)
                        </li>
                      )}
                    </ul>
                  </div>
                );
              })()}

              <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  URL
                </p>
                <p className="line-clamp-2 break-all font-mono text-[10px] text-gray-600">
                  {selected.url}
                </p>
              </div>

              <div className="flex gap-2">
                <CopyButton
                  value={selected.url}
                  label="Copiar URL"
                  className="flex-1 rounded-lg border border-[#0F2C6B]/20 py-2 text-xs font-bold text-[#0F2C6B] transition-colors hover:bg-[#0F2C6B]/5 disabled:opacity-100"
                />
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(selected.id)}
                  className="rounded-lg border border-red-100 px-3 py-2 text-xs font-bold text-red-500 transition-colors hover:bg-red-50"
                >
                  🗑
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
          <span>
            Página {currentPage} de {totalPages} · {totalItems}{" "}
            {totalItems === 1 ? "imagem" : "imagens"} no total
          </span>
          <Pagination
            current={currentPage}
            totalPages={totalPages}
            hrefForPage={(p) => buildUrl({ page: p })}
            className="flex items-center gap-1 py-0"
          />
        </div>
      )}
    </main>
  );
}
