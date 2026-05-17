"use client";

import { useEffect, useRef } from "react";

interface Props {
  initialValue?: string;
  onChange: (html: string) => void;
  minHeight?: number;
}

/**
 * Minimal contentEditable rich-text editor — placeholder until a real
 * rich editor (Tiptap, ProseMirror, etc.) is wired in. Supports basic
 * bold/italic/underline via the document.execCommand shim and emits HTML.
 */
export function RichTextEditor({
  initialValue = "",
  onChange,
  minHeight = 400,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Seed the editor once
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== initialValue) {
      ref.current.innerHTML = initialValue;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exec(cmd: string) {
    document.execCommand(cmd, false);
    if (ref.current) onChange(ref.current.innerHTML);
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 border-b border-gray-100 px-3 py-2 text-xs">
        {(["bold", "italic", "underline"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              exec(c);
            }}
            className="rounded px-2 py-1 font-bold text-gray-600 hover:bg-gray-100"
            aria-label={c}
          >
            {c === "bold" ? "B" : c === "italic" ? "I" : "U"}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="p-5 text-sm leading-relaxed text-gray-800 outline-none"
        style={{ minHeight }}
      />
    </div>
  );
}
