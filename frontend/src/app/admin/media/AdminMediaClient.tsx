"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/admin/CopyButton";
import { Pagination } from "@/components/category/Pagination";
import { validateImageUpload } from "@/lib/upload-limits";
import {
  createMediaAction,
  deleteMediaAction,
  uploadMediaFileAction,
} from "./actions";

export interface MediaItem {
  id: string;
  url: string;
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
  currentPage,
  totalPages,
  searchQuery,
}: {
  initialItems: MediaItem[];
  /** Items in the CURRENT page + search filter. */
  totalItems: number;
  /** Whole-library count, ignoring search. */
  statsTotal: number;
  currentPage: number;
  totalPages: number;
  searchQuery: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [searchDraft, setSearchDraft] = useState(searchQuery);
  const [filter, setFilter] = useState<"todas" | "usadas" | "nao-usadas">(
    "todas",
  );

  const buildUrl = (updates: { q?: string | null; page?: number | null }) => {
    const params = new URLSearchParams();
    const q = updates.q !== undefined ? updates.q : searchQuery;
    const page = updates.page !== undefined ? updates.page : currentPage;
    if (q) params.set("q", q);
    if (page && page > 1) params.set("page", String(page));
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
   * Direct-file upload — same flow as the article cover picker.
   * Validates client-side (mime + size), then POSTs FormData via the
   * server action. On success, refreshes the page so the new item
   * appears in the grid.
   */
  const uploadFile = (file: File | null | undefined) => {
    if (!file) return;
    const reason = validateImageUpload(file);
    if (reason) {
      setUploadError(reason);
      return;
    }
    setUploadError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadMediaFileAction(fd);
      if (!res.ok) {
        setUploadError(res.error);
        return;
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
                    : "Arraste uma imagem ou clique para escolher"}
                </p>
                <p className="text-[10px] text-gray-400">
                  JPG, PNG, WebP, GIF — até 10 MB. Processada em 3
                  variantes WebP automaticamente.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
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

      {/* FILTERS + SEARCH */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.url}
                alt={selected.name}
                className="h-full w-full object-cover"
              />
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
                {selected.size && (
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-gray-400">Tamanho</span>
                    <span className="text-gray-700">{selected.size}</span>
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
