"use client";

import { useEffect, useState } from "react";
import { imageVariant } from "@/lib/images";

interface MediaItem {
  id: string;
  url: string;
  urlMedium: string | null;
  urlSmall: string | null;
  name: string;
  width: number | null;
  height: number | null;
  mimeType: string | null;
}

interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Picker for the existing media library. Reuses the same /admin/media
 * endpoint that powers the standalone library page. The modal fetches
 * lazily on first open to keep the editor mount cheap.
 */
export function MediaLibraryModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (media: MediaItem) => void;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    let abort = false;
    setLoading(true);
    setError(null);
    fetch("/api/admin/media/proxy?pageSize=200", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PageResult<MediaItem>>;
      })
      .then((body) => {
        if (!abort) setItems(body.items);
      })
      .catch((e) => {
        if (!abort) setError((e as Error).message);
      })
      .finally(() => {
        if (!abort) setLoading(false);
      });
    return () => {
      abort = true;
    };
  }, [open]);

  if (!open) return null;

  const filtered = search
    ? items.filter((m) =>
        m.name.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-[#0F2C6B]">
              Biblioteca de Média
            </h2>
            <p className="text-xs text-gray-400">
              {filtered.length} {filtered.length === 1 ? "imagem" : "imagens"}
            </p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar…"
            className="w-56 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F2C6B] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <p className="py-10 text-center text-sm text-gray-400">
              A carregar…
            </p>
          )}
          {error && (
            <p className="py-10 text-center text-sm text-red-500">
              Erro: {error}
            </p>
          )}
          {!loading && !error && filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-400">
              Nenhuma imagem na biblioteca.
            </p>
          )}
          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((m) => {
                const thumb = imageVariant(m.urlSmall ?? m.url, "small") ?? m.url;
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => onPick(m)}
                    className="group relative aspect-video overflow-hidden rounded-xl border-2 border-transparent bg-gray-100 text-left transition-all hover:border-[#0F2C6B]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumb}
                      alt={m.name}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <p className="truncate text-[10px] font-semibold text-white">
                        {m.name}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type { MediaItem };
