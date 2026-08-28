"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Container } from "../Container";
import { CategoryPanel } from "./CategoryPanel";
import type { CategoryDef } from "@/lib/categories";

/** Long enough to read a bar of links before it moves under you. */
const ROTATE_MS = 12_000;
/** Grace period so the pointer can cross from a link into its panel. */
const CLOSE_DELAY_MS = 160;
const PANEL_MAX_WIDTH = 640;

interface PanelState {
  category: CategoryDef;
  left: number;
  top: number;
}

/**
 * The overflow strip, as a paging carousel with the same dropdowns as
 * the masthead.
 *
 * Pages, not items. The unit that slides is "however many links fit in
 * the bar right now", measured from the real laid-out widths rather than
 * assumed — category names run from "Saúde" to "Investigação", so any
 * fixed items-per-page guess is wrong at some viewport. One dot per page
 * means the dots tell the reader how much is left, which is the point of
 * having them at all. When everything already fits there is no carousel:
 * no dots, no transform, no timer.
 *
 * The panel is positioned `fixed` and measured from the link, rather
 * than absolutely inside it, because the sliding track needs
 * `overflow-hidden` to clip and that would equally clip a dropdown. CSS
 * cannot clip one axis and not the other — asking for it silently clips
 * both — so escaping the container is the only way both features can
 * coexist.
 */
export function SecondaryNavStrip({ items }: { items: CategoryDef[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  /** x-offset of the first link on each page. */
  const [pageOffsets, setPageOffsets] = useState<number[]>([0]);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group the links into pages from their measured positions.
  //
  // Observed rather than measured once: a web font swapping in after
  // first paint changes every link's width, and measuring only on mount
  // produced pages computed against a layout that no longer existed —
  // which showed up as a dot that moved nothing.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    const measure = () => {
      const width = viewport.clientWidth;
      const links = Array.from(track.children) as HTMLElement[];
      if (links.length === 0 || width === 0) {
        setPageOffsets([0]);
        return;
      }

      const starts = [0];
      let pageStart = 0;
      for (const link of links) {
        const right = link.offsetLeft + link.offsetWidth;
        // `offsetLeft > pageStart` keeps a link that is itself wider than
        // the bar from opening a page at the offset the current page
        // already starts at — a duplicate start renders a dot that
        // scrolls to where you already are.
        if (right - pageStart > width && link.offsetLeft > pageStart) {
          pageStart = link.offsetLeft;
          starts.push(pageStart);
        }
      }

      // Never scroll past the end. Without this, a last page holding one
      // short name ("Energia") parks it at the left edge with the rest of
      // the bar empty; clamped, the final page ends flush with the last
      // link and the bar always looks full. Consecutive duplicates are
      // dropped, since a page clamped onto the previous one is a dot that
      // goes nowhere.
      const maxOffset = Math.max(0, track.scrollWidth - width);
      const clamped = starts
        .map((s) => Math.min(s, maxOffset))
        .filter((s, i, all) => i === 0 || s !== all[i - 1]);

      setPageOffsets(clamped);
      // A wider viewport can leave fewer pages than the one we're on.
      setActive((i) => Math.min(i, clamped.length - 1));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    // The track too: its width changes when the font loads, without the
    // viewport ever resizing.
    observer.observe(track);
    return () => observer.disconnect();
  }, [items]);

  const pageCount = pageOffsets.length;

  // Auto-advance, frozen while the pointer is anywhere on the strip or
  // in an open panel. Not a timed pause: a reader hovering a section to
  // read its subsections keeps it still for as long as they want, and
  // gets no surprise jump the moment some countdown runs out.
  useEffect(() => {
    if (pageCount <= 1 || hovered) return;
    const timer = setInterval(
      () => setActive((i) => (i + 1) % pageCount),
      ROTATE_MS,
    );
    return () => clearInterval(timer);
  }, [pageCount, hovered]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openPanel = (category: CategoryDef, el: HTMLElement) => {
    cancelClose();
    if (category.children.length === 0) {
      setPanel(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - 24);
    // Anchor under the link, then pull it back inside the viewport if it
    // would hang off the right edge — links near the end of the bar are
    // exactly where this happens.
    const left = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - width - 12),
    );
    setPanel({ category, left, top: rect.bottom });
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPanel(null), CLOSE_DELAY_MS);
  };

  if (items.length === 0) return null;

  return (
    <div
      className="relative bg-[#f0f2f7]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        scheduleClose();
      }}
    >
      <Container className="flex h-9 items-center gap-4">
        <div ref={viewportRef} className="relative flex-1 overflow-hidden">
          <div
            ref={trackRef}
            className="flex items-center gap-6 whitespace-nowrap text-[12px] font-medium text-[#667085] transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${pageOffsets[active] ?? 0}px)` }}
          >
            {items.map((c) => (
              <Link
                key={c.slug}
                href={`/categoria/${c.slug}`}
                onMouseEnter={(e) => openPanel(c, e.currentTarget)}
                onFocus={(e) => openPanel(c, e.currentTarget)}
                className="shrink-0 transition hover:text-slate-900"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>

        {pageCount > 1 && (
          <div
            className="flex shrink-0 items-center gap-1.5"
            role="tablist"
            aria-label="Páginas de rubricas"
          >
            {pageOffsets.map((offset, i) => (
              <button
                key={`${i}-${offset}`}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`Mostrar rubricas, página ${i + 1} de ${pageCount}`}
                onClick={() => setActive(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === active
                    ? "h-1.5 w-5 bg-patriota-medium"
                    : "h-1.5 w-1.5 bg-slate-300 hover:w-3 hover:bg-slate-400"
                }`}
              />
            ))}
          </div>
        )}
      </Container>

      {panel && (
        <div
          className="fixed z-50 hidden lg:block"
          style={{
            left: panel.left,
            top: panel.top,
            width: Math.min(PANEL_MAX_WIDTH, 640),
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <CategoryPanel category={panel.category} />
        </div>
      )}
    </div>
  );
}
