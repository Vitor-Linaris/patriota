"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
// Note: StarterKit v3+ already includes Link and Underline. We
// configure them through StarterKit options below — registering them
// separately triggers a "Duplicate extension names" warning.
import { uploadMediaFileAction } from "@/app/admin/media/actions";
import {
  MediaLibraryModal,
  type MediaItem,
} from "./MediaLibraryModal";

interface Props {
  initialValue?: string;
  onChange: (html: string) => void;
  minHeight?: number;
}

/**
 * Tiptap-based rich text editor with a custom Tailwind toolbar.
 *
 * Outputs HTML compatible with the existing public renderer
 * (dangerouslySetInnerHTML in /artigo/[slug]/page.tsx). Existing
 * articles stored as `<p>…</p>` / `<strong>` etc. render unchanged.
 *
 * Image insertion supports two paths:
 *   1. Upload from disk → POST /admin/media/upload → insert large URL
 *   2. Pick from the existing Media library
 * Both end up as `<img src="…-large.webp">` in the saved HTML.
 */
export function RichTextEditor({
  initialValue = "",
  onChange,
  minHeight = 400,
}: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const editor = useEditor({
    immediatelyRender: false, // avoid SSR hydration mismatch
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ["http", "https", "mailto"],
          HTMLAttributes: { rel: "noopener nofollow", target: "_blank" },
        },
      }),
      Image.configure({
        HTMLAttributes: { class: "rounded-lg" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Comece a escrever…" }),
    ],
    content: initialValue,
    editorProps: {
      attributes: {
        class:
          "prose prose-slate max-w-none px-5 py-4 focus:outline-none [&_p]:my-3 [&_h2]:mt-6 [&_h3]:mt-5",
      },
    },
    onUpdate({ editor }) {
      onChangeRef.current(editor.getHTML());
    },
  });

  // Keep the editor content in sync when the parent swaps articles.
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === initialValue) return;
    editor.commands.setContent(initialValue || "", { emitUpdate: false });
  }, [editor, initialValue]);

  const insertImage = (url: string) => {
    if (!editor || !url) return;
    editor.chain().focus().setImage({ src: url }).run();
  };

  const handleUpload = async (file: File | null | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadMediaFileAction(fd);
      if (res.ok) insertImage(res.media.url);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const promptLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link", prev ?? "https://");
    if (url === null) return; // cancelled
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  };

  if (!editor) {
    return (
      <div
        className="flex items-center justify-center text-xs text-gray-300"
        style={{ minHeight }}
      >
        A carregar editor…
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Toolbar
        editor={editor}
        uploading={uploading}
        onUpload={() => fileRef.current?.click()}
        onLibrary={() => setLibraryOpen(true)}
        onLink={promptLink}
      />
      <div style={{ minHeight }} className="bg-white">
        <EditorContent editor={editor} />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleUpload(e.target.files?.[0])}
      />
      <MediaLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onPick={(m: MediaItem) => {
          insertImage(m.url);
          setLibraryOpen(false);
        }}
      />
    </div>
  );
}

function Toolbar({
  editor,
  uploading,
  onUpload,
  onLibrary,
  onLink,
}: {
  editor: Editor;
  uploading: boolean;
  onUpload: () => void;
  onLibrary: () => void;
  onLink: () => void;
}) {
  const Btn = ({
    onClick,
    active,
    title,
    children,
    disabled,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      // onMouseDown + preventDefault keeps focus inside the editor
      onMouseDown={(e) => {
        e.preventDefault();
        if (!disabled) onClick();
      }}
      className={`flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 text-[12px] font-semibold transition-colors ${
        active
          ? "bg-[#0F2C6B] text-white"
          : "text-gray-600 hover:bg-gray-100 disabled:opacity-40"
      }`}
    >
      {children}
    </button>
  );

  const sep = <span className="mx-1 h-5 w-px shrink-0 bg-gray-200" />;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-gray-100 px-3 py-2 text-xs">
      <select
        value={
          editor.isActive("heading", { level: 2 })
            ? "h2"
            : editor.isActive("heading", { level: 3 })
              ? "h3"
              : editor.isActive("heading", { level: 4 })
                ? "h4"
                : "p"
        }
        onChange={(e) => {
          const v = e.target.value;
          const c = editor.chain().focus();
          if (v === "p") c.setParagraph().run();
          else c.toggleHeading({ level: Number(v.slice(1)) as 2 | 3 | 4 }).run();
        }}
        className="h-7 rounded border border-gray-200 bg-white px-2 text-[12px] focus:border-[#0F2C6B] focus:outline-none"
      >
        <option value="p">Parágrafo</option>
        <option value="h2">Título 2</option>
        <option value="h3">Título 3</option>
        <option value="h4">Título 4</option>
      </select>
      {sep}
      <Btn
        title="Negrito"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </Btn>
      <Btn
        title="Itálico"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </Btn>
      <Btn
        title="Sublinhado"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </Btn>
      <Btn
        title="Riscado"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <s>S</s>
      </Btn>
      <Btn
        title="Código inline"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        {"</>"}
      </Btn>
      {sep}
      <Btn
        title="Lista"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        ⁃
      </Btn>
      <Btn
        title="Lista numerada"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </Btn>
      <Btn
        title="Citação"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        ❝
      </Btn>
      <Btn
        title="Linha horizontal"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        ─
      </Btn>
      {sep}
      <Btn
        title="Alinhar à esquerda"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        ⫷
      </Btn>
      <Btn
        title="Centrar"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        ☰
      </Btn>
      <Btn
        title="Alinhar à direita"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        ⫸
      </Btn>
      {sep}
      <Btn title="Inserir/editar link" active={editor.isActive("link")} onClick={onLink}>
        🔗
      </Btn>
      <Btn title="Carregar imagem" disabled={uploading} onClick={onUpload}>
        {uploading ? "…" : "⬆🖼"}
      </Btn>
      <Btn title="Imagem da biblioteca" onClick={onLibrary}>
        🖼
      </Btn>
      {sep}
      <Btn
        title="Desfazer"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        ↶
      </Btn>
      <Btn
        title="Refazer"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        ↷
      </Btn>
    </div>
  );
}
