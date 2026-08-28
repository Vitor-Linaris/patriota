"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { INDENT_WIDTH } from "./tree-utils";

/**
 * One draggable row. Only the handle starts a drag — the row is full of
 * buttons and inputs, and making the whole thing draggable would turn
 * every click on them into an accidental drag.
 */
export function SortableRow({
  id,
  depth,
  children,
  handleLabel,
}: {
  id: string;
  depth: number;
  children: ReactNode;
  handleLabel: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        marginInlineStart: depth * INDENT_WIDTH,
      }}
      className={isDragging ? "relative z-10 opacity-40" : "relative"}
    >
      <div className="flex items-stretch">
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={handleLabel}
          className="flex w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-l-xl border border-r-0 border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-[#0F2C6B] active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <span aria-hidden>⠿</span>
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
