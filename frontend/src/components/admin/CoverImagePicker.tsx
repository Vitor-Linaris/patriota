"use client";

import { useRef, useState, useTransition } from "react";
import { uploadMediaFileAction } from "@/app/admin/media/actions";
import { imageVariant } from "@/lib/images";
import { adminMediaUrl } from "@/lib/media-preview";
import { validateImageUpload } from "@/lib/upload-limits";
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
  purpose = "EDITORIAL",
  onDelete,
}: {
  value: string;
  onChange: (url: string) => void;
  /**
   * What the upload is for. PUBLICIDADE keeps the file out of the
   * newsroom library — a banner belongs to one ad slot and is of no use
   * to anybody writing.
   */
  purpose?: "EDITORIAL" | "PUBLICIDADE";
  /**
   * What the ✕ does, when the caller wants more than "forget this URL".
   *
   * The advertising screen passes a handler that deletes the file for
   * good, behind a confirmation. Everywhere else the ✕ just clears the
   * field, which is right for an article: the photograph is shared and
   * removing it from this cover must not touch anybody else's.
   */
  onDelete?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const handleFiles = (file: File | null | undefined) => {
    if (!file) return;
    // Validate locally first — Next.js's 12 MB server-action cap would
    // otherwise turn into a generic "Unexpected response from server".
    const reason = validateImageUpload(file);
    if (reason) {
      setError(reason);
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadMediaFileAction(fd, purpose);
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

  // The medium variant, for a small card — and through the admin
  // proxy, because a cover that was just uploaded is private until the
  // article is published, and an <img> pointed at the API carries no
  // session. Without this the editor shows a broken image for exactly
  // as long as the article is unpublished, which is all of the time
  // anybody is looking at it.
  const previewUrl = adminMediaUrl(imageVariant(value, "medium") ?? value);

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
            onClick={() => (onDelete ? onDelete() : onChange(""))}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
            aria-label={onDelete ? "Eliminar imagem" : "Remover imagem de capa"}
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
          <p className="text-[10px] text-gray-400">
            JPG, PNG, WebP, AVIF — até 10 MB · GIF animado até 11 MB
          </p>
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
