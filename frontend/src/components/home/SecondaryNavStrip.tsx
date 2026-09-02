"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Container } from "../Container";
import { CategoryPanel } from "./CategoryPanel";
import type { CategoryDef } from "@/lib/categories";

/** Long enough to read a bar of links before it moves under you. */
const ROTATE_MS = 12_000;
/**
 * Width kept clear at the right for the dot indicator (`sm:` and up).
 *
 * Reserved unconditionally, and the dots are taken out of the flow, so
 * the width the paging maths runs against NEVER depends on how many dots
 * happen to be rendered. Letting the dots sit in the flow created a
 * feedback loop — dots appear, the bar narrows, the page count changes,
 * the dots resize, it measures again — and the offsets you ended up with
 * were wherever that oscillation happened to stop. That is what made a
 * dot scroll by 10px instead of a full page.
 */
const DOTS_RESERVE = 72;
/**
 * Below `sm:` the dots are hidden entirely (there's no room, and a
 * phone reader drags with a finger, not a pointer) — just a sliver of
 * fade at the edge to say "there's more", not a whole tap-target zone.
 * Matches the `hidden sm:flex` on the dots below; keep the two in sync.
 */
const MOBILE_EDGE_RESERVE = 28;
/** Tailwind's `sm:` breakpoint — the switch between the two reserves above. */
const SM_BREAKPOINT_QUERY = "(min-width: 640px)";
/** Grace period so the pointer can cross from a link into its panel. */
const CLOSE_DELAY_MS = 160;
const PANEL_MAX_WIDTH = 640;

interface PanelState {
  category: CategoryDef;
  left: number;
  top: number;
  /**
   * Carried in state rather than recomputed at render: the position was
   * clamped against the narrowed width, so rendering at the unclamped
   * max put the panel's right edge past the viewport, which pushed the
   * document wider and let the whole page scroll sideways.
   */
  width: number;
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
 * than absolutely inside it, because the strip needs its own scrolling
 * and that would equally clip a dropdown. CSS cannot let one axis
 * scroll and not clip the other — a scrollable container clips
 * everything that overflows it — so escaping the container is the only
 * way both features can coexist.
 *
 * The viewport scrolls NATIVELY (`overflow-x-auto`), not by a CSS
 * transform driven only from JS. It used to be transform-only, which
 * is why a finger dragging the strip on a phone did nothing — there
 * was no scrollable axis for the browser's own touch handling to grab.
 * Paging (dots, auto-rotate) now drives the same native scroll via
 * `scrollTo()`, so a tap on a dot and a finger swipe move the exact
 * same thing instead of two mechanisms fighting over the strip's
 * position.
 */
export function SecondaryNavStrip({ items }: { items: CategoryDef[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  /** x-offset of the first link on each page. */
  const [pageOffsets, setPageOffsets] = useState<number[]>([0]);
  /**
   * DOTS_RESERVE or MOBILE_EDGE_RESERVE, whichever the viewport matches
   * right now. Computed once in `measure()` and reused everywhere else
   * (the track's padding, the mask width, the maxOffset clamp below) —
   * three places quietly disagreeing on this number is exactly what
   * made the last page overshoot the real scrollable end and bounce
   * back (see the maxOffset comment below).
   */
  const [reserve, setReserve] = useState(DOTS_RESERVE);
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
      const r = window.matchMedia(SM_BREAKPOINT_QUERY).matches
        ? DOTS_RESERVE
        : MOBILE_EDGE_RESERVE;
      setReserve(r);

      // The reserved strip at the right (dots or just the fade sliver)
      // sits fixed on top of the viewport at every scroll position, so
      // a page's usable reading width is always clientWidth minus it —
      // this is ONLY for deciding where a page break falls, never for
      // how far the strip can actually scroll (that's maxOffset below).
      const pageWidth = viewport.clientWidth - r;
      const links = Array.from(track.children) as HTMLElement[];
      if (links.length === 0 || pageWidth <= 0) {
        setPageOffsets((prev) => (prev.length === 1 && prev[0] === 0 ? prev : [0]));
        return;
      }

      // The last link carries a `paddingRight: reserve` of its own
      // (JSX, below) once there's a next page — real space after it, so
      // the last page's content never ends up hidden under the dots
      // with nothing left to scroll past. It has to be padding on that
      // link's OWN box specifically: `padding-right` on the track,
      // `margin-right` on the last link, and a trailing spacer element
      // were all tried first, and in this flex-with-`gap` layout
      // Chromium's scrollable-overflow calculation silently excludes
      // all three from how far it will actually let you scroll — only
      // a box's own padding reliably counts.
      //
      // But that also means `lastLink.offsetWidth` already has this
      // padding baked in once it's applied, which would double-count
      // it below — the page-break loop would see the last link as
      // `reserve` px wider than its text and could open a bogus final
      // page holding nothing but that padding, and `maxOffset` would
      // overshoot by `reserve` and land past where the browser will
      // really scroll (the last page's dot bouncing straight back,
      // which is exactly what shipped before this was caught). Reading
      // the padding straight off the DOM and subtracting it back out
      // gives the true, un-padded text edge to measure from — stable
      // whether or not the padding happens to be applied this render.
      const lastLink = links[links.length - 1];
      const lastLinkPad =
        parseFloat(getComputedStyle(lastLink).paddingRight) || 0;

      const starts = [0];
      let pageStart = 0;
      links.forEach((link, i) => {
        const pad = i === links.length - 1 ? lastLinkPad : 0;
        const right = link.offsetLeft + link.offsetWidth - pad;
        // `offsetLeft > pageStart` keeps a link that is itself wider than
        // the bar from opening a page at the offset the current page
        // already starts at — a duplicate start renders a dot that
        // scrolls to where you already are.
        if (right - pageStart > pageWidth && link.offsetLeft > pageStart) {
          pageStart = link.offsetLeft;
          starts.push(pageStart);
        }
      });

      // Never scroll past what the browser will actually scroll to.
      // `contentEdge` is the un-padded text edge (see above); adding
      // `reserve` back via `- pageWidth` (which is `clientWidth -
      // reserve`) reconstructs exactly how far the real, padded box
      // will let the strip scroll — `contentEdge - pageWidth ==
      // (contentEdge + reserve) - clientWidth`.
      const contentEdge = lastLink.offsetLeft + lastLink.offsetWidth - lastLinkPad;
      const maxOffset = Math.max(0, contentEdge - pageWidth);
      const clamped = starts
        .map((s) => Math.min(s, maxOffset))
        .filter((s, i, all) => i === 0 || s !== all[i - 1]);

      // Skip the state update entirely when nothing actually changed.
      // Without this, a resize the padding itself caused would still
      // produce a NEW array with the SAME values every time — and a
      // new array reference is still a change as far as the effect
      // below is concerned, so it would keep re-triggering scrollTo
      // forever even once the numbers had stabilised.
      setPageOffsets((prev) =>
        prev.length === clamped.length && prev.every((v, i) => v === clamped[i])
          ? prev
          : clamped,
      );
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
  /**
   * +1 or -1. A ref, not state: it drives which way the NEXT tick steps
   * but is never itself rendered, so it doesn't need to trigger a
   * re-render when it flips.
   */
  const rotateDirection = useRef(1);

  // Auto-advance, frozen while the pointer is anywhere on the strip or
  // in an open panel. Not a timed pause: a reader hovering a section to
  // read its subsections keeps it still for as long as they want, and
  // gets no surprise jump the moment some countdown runs out.
  //
  // Bounces at the ends rather than wrapping `% pageCount` back to page
  // 1. With only a couple of pages a wrap is a short hop and barely
  // registers, but this strip now pages through a dozen-plus rubrics —
  // wrapping from the last page meant a full-width scroll slammed all
  // the way back to the start, which read as the carousel glitching
  // rather than advancing. Reversing direction at each end keeps every
  // step the same size as the ones before it.
  useEffect(() => {
    if (pageCount <= 1 || hovered) return;
    const timer = setInterval(() => {
      setActive((i) => {
        let next = i + rotateDirection.current;
        if (next < 0 || next >= pageCount) {
          rotateDirection.current *= -1;
          next = i + rotateDirection.current;
        }
        return next;
      });
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [pageCount, hovered]);

  // The one thing that actually moves the strip, for every source of
  // paging: the dots, the auto-rotate timer, both just change `active`.
  // Smooth-scrolls to that page's offset; a finger dragging the strip
  // moves it too, through the browser's own touch handling, with
  // nothing here to fight it.
  useEffect(() => {
    viewportRef.current?.scrollTo({
      left: pageOffsets[active] ?? 0,
      behavior: "smooth",
    });
  }, [active, pageOffsets]);

  // Keeps the dots honest after a manual swipe. Debounced on `scroll`
  // rather than reading position continuously: mid-swipe the strip
  // sits between two pages, and picking a "closest" dot at every pixel
  // would flicker the highlighted one back and forth as a finger
  // crosses the midpoint.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || pageOffsets.length <= 1) return;
    let settle: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        const at = viewport.scrollLeft;
        let closest = 0;
        let best = Infinity;
        pageOffsets.forEach((offset, i) => {
          const d = Math.abs(offset - at);
          if (d < best) {
            best = d;
            closest = i;
          }
        });
        setActive(closest);
      }, 120);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(settle);
      viewport.removeEventListener("scroll", onScroll);
    };
  }, [pageOffsets]);

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
    // Bottom of the BAR, not of the link: anchoring to the link's own
    // box left the panel overlapping the last few pixels of the strip.
    const barBottom =
      viewportRef.current?.getBoundingClientRect().bottom ?? rect.bottom;
    setPanel({ category, left, top: barBottom, width });
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
      <Container className="relative flex h-9 items-center">
        <div
          ref={viewportRef}
          className="scrollbar-hide relative flex-1 overflow-x-auto"
          style={{
            WebkitOverflowScrolling: "touch",
            // Fades the last link into the dots instead of the dots'
            // solid background hard-cutting it mid-word — the dots sit
            // absolutely on top of this viewport, not in normal flow,
            // so without a fade the text was simply invisible behind
            // them rather than actually clipped.
            maskImage:
              pageCount > 1
                ? `linear-gradient(to right, black 0%, black calc(100% - ${reserve}px), transparent 100%)`
                : undefined,
            WebkitMaskImage:
              pageCount > 1
                ? `linear-gradient(to right, black 0%, black calc(100% - ${reserve}px), transparent 100%)`
                : undefined,
          }}
        >
          <div
            ref={trackRef}
            className="flex items-center gap-6 whitespace-nowrap text-[12px] font-medium text-[#667085]"
          >
            {items.map((c, i) => (
              <Link
                key={c.slug}
                href={`/categoria/${c.slug}`}
                onMouseEnter={(e) => openPanel(c, e.currentTarget)}
                onFocus={(e) => openPanel(c, e.currentTarget)}
                className="shrink-0 transition hover:text-slate-900"
                // `paddingRight` on the LAST link's own box — not on
                // the track, not `marginRight`, not a trailing spacer
                // element, all three tried and all three silently
                // clamped `reserve` px short of the intended target.
                // In this flex-with-`gap` layout, Chromium's scrollable
                // overflow only reliably counts a box's OWN padding —
                // padding on an ancestor, a sibling's box, or a child's
                // margin all landed outside whatever it measures, so
                // asking to scroll into that space just got refused.
                // Padding inside the last link's own border box is
                // unambiguously part of ITS box, so it's the one place
                // this actually works.
                style={
                  pageCount > 1 && i === items.length - 1
                    ? { paddingRight: reserve }
                    : undefined
                }
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>

        {pageCount > 1 && (
          // Same dot-indicator language as <BreakingNews>'s ticker —
          // duplicated rather than shared, since the two live in
          // unrelated components with their own background/timing and
          // sharing one would just couple them for no benefit.
          //
          // Absolute, so the paging maths above never has to account
          // for its own indicator; the mask + the last link's own
          // padding (above) are what actually keep the track's text
          // out from under it.
          //
          // `hidden sm:flex`: below `sm:` there's no pointer to click a
          // dot with and not enough width to fit them without crowding
          // the fade — a phone reader pages this by dragging, and the
          // fade sliver (MOBILE_EDGE_RESERVE, above) is what tells them
          // there's more to pull into view.
          <div
            className="absolute inset-y-0 right-0 hidden shrink-0 items-center gap-1.5 sm:flex"
            role="tablist"
            aria-label="Páginas de rubricas"
          >
            {pageOffsets.map((offset, i) => {
              const isActive = i === active;
              return (
                <button
                  key={`${i}-${offset}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`Mostrar rubricas, página ${i + 1} de ${pageCount}`}
                  onClick={() => setActive(i)}
                  className={`rounded-full transition-all duration-300 ${
                    isActive
                      ? "h-2 w-6 bg-patriota-medium"
                      : "h-2 w-2 bg-slate-300 hover:bg-slate-400"
                  }`}
                />
              );
            })}
          </div>
        )}
      </Container>

      {panel && (
        <div
          className="fixed z-50 hidden lg:block"
          style={{ left: panel.left, top: panel.top, width: panel.width }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <CategoryPanel category={panel.category} />
        </div>
      )}
    </div>
  );
}
