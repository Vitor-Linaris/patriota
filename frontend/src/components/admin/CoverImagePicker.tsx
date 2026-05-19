"use client";

import { useRef, useState, useTransition } from "react";
import { uploadMediaFileAction } from "@/app/admin/media/actions";
import { imageVariant } from "@/lib/images";
import { MediaLibraryModal } from "./MediaLibraryModal";

/**
 * Three-mode cover image picker:
 *   1. Drag-and-drop / click-to-upload (multipart POST to /admin/media/upload)
 *   2. Pick an existing item from the media library modal
 *   3. Manual URL paste (legacy/external)
 *
 * Outputs a single string — the canonical (large) URL — so the parent
 * form keeps its existing shape. Consumers later pick the variant
 * needed for their surface via `imageVariant(url, "small"|"medium"|"large")`.
 */
export function CoverImagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const handleFiles = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Apenas ficheiros de imagem são suportados.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadMediaFileAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onChange(res.media.url);
    });
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files?.[0]);
  };

  // Show the medium variant for the inline preview (no need for full
  // resolution in a tiny editor card).
  const previewUrl = imageVariant(value, "medium") ?? value;

  return (
    <div className="space-y-3">
      {value ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="capa"
            className="aspect-video w-full rounded-xl object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
            aria-label="Remover imagem de capa"
          >
            ✕
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed ${
            dragOver
              ? "border-[#0F2C6B] bg-[#0F2C6B]/5"
              : "border-gray-200 bg-gray-50"
          } transition-colors hover:border-[#0F2C6B] hover:bg-[#0F2C6B]/5`}
        >
          <span className="text-3xl text-gray-300">↑</span>
          <p className="text-xs font-semibold text-gray-500">
            {pending ? "A enviar…" : "Arraste uma imagem ou clique para escolher"}
          </p>
          <p className="text-[10px] text-gray-400">JPG, PNG, WebP — até 10 MB</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files?.[0])}
      />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="flex-1 rounded-lg border border-[#0F2C6B]/20 px-3 py-2 text-xs font-bold text-[#0F2C6B] transition-colors hover:bg-[#0F2C6B]/5 disabled:opacity-50"
        >
          Carregar do PC
        </button>
        <button
          type="button"
          onClick={() => setLibraryOpen(true)}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50"
        >
          Da biblioteca
        </button>
      </div>

      <details className="rounded-lg border border-gray-100 px-3 py-2">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          ou colar URL externo
        </summary>
        <input
          type="url"
          value={value && !value.includes("/uploads/") ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://exemplo.com/foto.jpg"
          className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs focus:border-[#0F2C6B] focus:outline-none"
        />
      </details>

      {error && (
        <p className="text-xs font-semibold text-red-600">{error}</p>
      )}

      <MediaLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onPick={(media) => {
          onChange(media.url);
          setLibraryOpen(false);
        }}
      />
    </div>
  );
}
