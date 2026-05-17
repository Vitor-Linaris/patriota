"use client";

import { useEffect, useRef, useState } from "react";

export interface MediaItem {
  id: string;
  url: string;
  name: string;
  uploadedAt: string;
  size?: string;
  dimensions?: string;
  usedIn?: string[];
}

const STORAGE_KEY = "patriota_media";

function loadMedia(): MediaItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveMedia(items: MediaItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

const SAMPLE_IMAGES: MediaItem[] = [
  { id: "s1", url: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800", name: "parlamento-lisboa.jpg", uploadedAt: "12 Abr 2026", size: "1.2 MB", dimensions: "1920×1080", usedIn: ["Governo apresenta proposta de orçamento"] },
  { id: "s2", url: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800", name: "economia-grafico.jpg", uploadedAt: "12 Abr 2026", size: "890 KB", dimensions: "1600×900", usedIn: ["FMI alerta para riscos da dívida pública"] },
  { id: "s3", url: "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800", name: "professores-greve.jpg", uploadedAt: "11 Abr 2026", size: "1.5 MB", dimensions: "1920×1280", usedIn: ["Greve dos professores paralisa escolas"] },
  { id: "s4", url: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800", name: "lisboa-cidade.jpg", uploadedAt: "09 Abr 2026", size: "2.1 MB", dimensions: "2560×1440", usedIn: [] },
  { id: "s5", url: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800", name: "habitacao-predio.jpg", uploadedAt: "09 Abr 2026", size: "1.8 MB", dimensions: "1920×1280", usedIn: ["Crise da habitação em Lisboa"] },
  { id: "s6", url: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=800", name: "tecnologia-ia.jpg", uploadedAt: "14 Abr 2026", size: "750 KB", dimensions: "1600×900", usedIn: ["Inteligência artificial na redacção"] },
];

export default function AdminMediaClient() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todas" | "usadas" | "nao-usadas">("todas");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadUrl, setUploadUrl] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadDimensions, setUploadDimensions] = useState("");
  const [copied, setCopied] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialise from localStorage on the client
  useEffect(() => {
    const existing = loadMedia();
    if (existing.length === 0) {
      saveMedia(SAMPLE_IMAGES);
      setItems(SAMPLE_IMAGES);
    } else {
      setItems(existing);
    }
  }, []);

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    const matchSearch =
      item.name.toLowerCase().includes(q) ||
      (item.usedIn ?? []).some((a) => a.toLowerCase().includes(q));
    const matchFilter =
      filter === "todas"
        ? true
        : filter === "usadas"
          ? (item.usedIn ?? []).length > 0
          : (item.usedIn ?? []).length === 0;
    return matchSearch && matchFilter;
  });

  const addFromUrl = () => {
    if (!uploadUrl.trim()) return;
    const newItem: MediaItem = {
      id: `m${Date.now()}`,
      url: uploadUrl.trim(),
      name:
        uploadName.trim() ||
        uploadUrl.split("/").pop()?.split("?")[0] ||
        "imagem.jpg",
      uploadedAt: new Date().toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      dimensions: uploadDimensions.trim() || undefined,
      usedIn: [],
    };
    const updated = [newItem, ...items];
    setItems(updated);
    saveMedia(updated);
    setUploadUrl("");
    setUploadName("");
    setUploadDimensions("");
    setUploadOpen(false);
    setSelected(newItem);
  };

  const deleteItem = (id: string) => {
    const updated = items.filter((i) => i.id !== id);
    setItems(updated);
    saveMedia(updated);
    if (selected?.id === id) setSelected(null);
    setDeleteConfirm(null);
  };

  const copyUrl = (url: string) => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const stats = {
    total: items.length,
    usadas: items.filter((i) => (i.usedIn ?? []).length > 0).length,
    naoUsadas: items.filter((i) => (i.usedIn ?? []).length === 0).length,
  };

  return (
    <main className="bg-[#f6f7fb] p-8">
      {/* UPLOAD MODAL */}
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
                  Cole o URL de uma imagem pública
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
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                  URL da imagem *
                </label>
                <input
                  autoFocus
                  value={uploadUrl}
                  onChange={(e) => setUploadUrl(e.target.value)}
                  placeholder="https://exemplo.com/foto.jpg"
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 font-mono text-sm focus:border-[#0F2C6B] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Nome do ficheiro
                  </label>
                  <input
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="foto-artigo.jpg"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Dimensões
                  </label>
                  <input
                    value={uploadDimensions}
                    onChange={(e) => setUploadDimensions(e.target.value)}
                    placeholder="1920×1080"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                  />
                </div>
              </div>

              {uploadUrl && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Pré-visualização
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={uploadUrl}
                    alt=""
                    className="aspect-video w-full rounded-lg object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setUploadOpen(false)}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={addFromUrl}
                  className="flex-1 rounded-xl bg-[#0F2C6B] py-2.5 text-sm font-bold text-white hover:bg-[#1A3A7A]"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="w-80 rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 font-black text-gray-800">Eliminar imagem?</p>
            <p className="mb-5 text-sm text-gray-500">
              Esta acção não pode ser desfeita. A imagem será removida da
              biblioteca.
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
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

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
          { label: "Total de imagens", value: stats.total, color: "text-[#0F2C6B]", bg: "bg-white border-gray-100" },
          { label: "Usadas em artigos", value: stats.usadas, color: "text-green-600", bg: "bg-green-50 border-green-100" },
          { label: "Sem utilização", value: stats.naoUsadas, color: "text-amber-600", bg: "bg-amber-50 border-amber-100" },
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por nome ou artigo…"
            className="flex-1 bg-transparent py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
          />
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
                const used = (item.usedIn ?? []).length > 0;
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
                      className={`absolute right-2 top-2 h-2 w-2 rounded-full ${used ? "bg-green-400" : "bg-gray-300"}`}
                      title={used ? "Usada em artigo" : "Sem uso"}
                    />
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
                    <span className="font-semibold text-gray-400">Dimensões</span>
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
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-gray-400">Usada em</span>
                  <span className="font-semibold text-gray-700">
                    {(selected.usedIn ?? []).length} artigo(s)
                  </span>
                </div>
              </div>

              <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  URL
                </p>
                <p className="line-clamp-2 break-all font-mono text-[10px] text-gray-600">
                  {selected.url}
                </p>
              </div>

              {(selected.usedIn ?? []).length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Usada nos artigos
                  </p>
                  <div className="space-y-1">
                    {selected.usedIn!.map((art, i) => (
                      <div
                        key={i}
                        className="line-clamp-1 rounded-lg bg-gray-50 px-2 py-1.5 text-[11px] text-gray-600"
                      >
                        {art}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copyUrl(selected.url)}
                  className="flex-1 rounded-lg border border-[#0F2C6B]/20 py-2 text-xs font-bold text-[#0F2C6B] transition-colors hover:bg-[#0F2C6B]/5"
                >
                  {copied ? "✓ Copiado!" : "Copiar URL"}
                </button>
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

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" />
    </main>
  );
}
