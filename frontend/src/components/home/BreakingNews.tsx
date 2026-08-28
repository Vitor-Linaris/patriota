"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Container } from "../Container";

interface BreakingItem {
  slug: string;
  title: string;
}

/**
 * Last-hour ticker — proper sliding carousel.
 *
 * The whole strip of headlines is rendered side-by-side; on rotation
 * we measure the active headline's `offsetLeft` and translate the
 * strip by that amount, so the active headline always lands at the
 * leftmost visible position. Headlines that already passed slide
 * off-screen to the left (overflow-hidden clips them); upcoming ones
 * sit to the right and the right-edge mask fades them out before
 * they reach the dot indicator.
 *
 * Auto-rotates every 6s; manual interaction (dot click, hover) pauses
 * for 12s so the reader has time to act.
 */
export function BreakingNews({ items }: { items: BreakingItem[] }) {
  const list = items.slice(0, 4);
  const [active, setActive] = useState(0);
  const [pauseUntil, setPauseUntil] = useState(0);
  const [offset, setOffset] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  // Measure the active headline's position once it's rendered, then
  // translate the strip so it lands at x=0. Re-measures on resize so
  // viewport changes don't break alignment.
  useLayoutEffect(() => {
    const measure = () => {
      const el = itemRefs.current[active];
      if (el) setOffset(el.offsetLeft);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, list.length]);

  // Auto-rotate.
  useEffect(() => {
    if (list.length <= 1) return;
    const timer = setInterval(() => {
      if (Date.now() < pauseUntil) return;
      setActive((i) => (i + 1) % list.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [list.length, pauseUntil]);

  const pause = () => setPauseUntil(Date.now() + 12_000);

  if (list.length === 0) return null;

  return (
    <div
      style={{
        background: "linear-gradient(180deg, #36C -71.25%, #1E2C4D 212.5%)",
      }}
    >
      <Container className="flex h-10 items-center gap-6">
        <span className="shrink-0 rounded bg-patriota-accent px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-patriota-medium">
          Última hora
        </span>

        {/* Sliding track. The mask fades the right edge so upcoming
            headlines dissolve into the dot indicator instead of
            crashing into it. */}
        <div
          className="relative flex-1 overflow-hidden text-[14px]"
          style={{
            maskImage:
              "linear-gradient(to right, black 0%, black calc(100% - 48px), transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, black 0%, black calc(100% - 48px), transparent 100%)",
          }}
        >
          <div
            ref={stripRef}
            className="flex items-center gap-7 whitespace-nowrap transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${offset}px)` }}
          >
            {list.map((item, i) => {
              const isActive = i === active;
              return (
                <a
                  key={item.slug}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  href={`/artigo/${item.slug}`}
                  onMouseEnter={pause}
                  className={`shrink-0 transition-opacity duration-500 ${
                    isActive
                      ? "text-white opacity-100"
                      : "text-white/55 opacity-70 hover:text-white/80"
                  }`}
                >
                  {item.title}
                </a>
              );
            })}
          </div>
        </div>

        {/* Dot indicator — clickable nav. Each button is a fixed 24×24
            hit area with the pill drawn inside it: an 8px dot that also
            grew on hover was both too small to aim at and liable to
            reflow the row out from under the pointer. */}
        {list.length > 1 && (
          <div className="hidden shrink-0 items-center gap-1 md:flex">
            {list.map((_, i) => {
              const isActive = i === active;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setActive(i);
                    pause();
                  }}
                  aria-label={`Mostrar manchete ${i + 1}`}
                  aria-current={isActive ? "true" : undefined}
                  className="group/dot flex h-6 w-6 items-center justify-end"
                >
                  <span
                    aria-hidden
                    className={`block h-2 rounded-full transition-all duration-300 ${
                      isActive
                        ? "w-5 bg-patriota-accent"
                        : "w-2 bg-white/30 group-hover/dot:bg-white/70"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        )}
      </Container>
    </div>
  );
}
