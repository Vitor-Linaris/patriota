"use client";

import { useEffect, useState } from "react";
import { Container } from "../Container";

interface BreakingItem {
  slug: string;
  title: string;
}

/**
 * Last-hour ticker. Shows up to 4 headlines with a dot indicator on
 * the right that doubles as a slider control:
 *   • The "active" headline is fully bright; the others dim.
 *   • Clicking a dot promotes the corresponding headline.
 *   • A 6-second auto-rotation keeps the strip alive when the user
 *     is idle; any manual interaction (dot click, headline hover)
 *     pauses it for 12 seconds so the reader has time to act.
 *   • The right edge fades to transparent via mask-image so the
 *     headlines don't visually crash into the dots.
 */
export function BreakingNews({ items }: { items: BreakingItem[] }) {
  const list = items.slice(0, 4);
  const [active, setActive] = useState(0);
  const [pauseUntil, setPauseUntil] = useState(0);

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

        {/* Slider track. The fade-to-transparent mask on the right
            edge stops the text from crashing into the dot indicator. */}
        <div
          className="relative flex-1 overflow-hidden text-[14px]"
          style={{
            maskImage:
              "linear-gradient(to right, black 0%, black calc(100% - 48px), transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, black 0%, black calc(100% - 48px), transparent 100%)",
          }}
        >
          <div className="flex items-center gap-7 whitespace-nowrap">
            {list.map((item, i) => {
              const isActive = i === active;
              return (
                <a
                  key={item.slug}
                  href={`/artigo/${item.slug}`}
                  onMouseEnter={pause}
                  className={`shrink-0 transition-all duration-500 ${
                    isActive
                      ? "text-white opacity-100"
                      : "text-white/40 opacity-60 hover:text-white/70"
                  }`}
                  style={
                    isActive
                      ? { letterSpacing: "0.01em" }
                      : undefined
                  }
                >
                  {item.title}
                </a>
              );
            })}
          </div>
        </div>

        {/* Dot indicator — a button each, so the slider doubles as
            navigation. Active dot is wider + amber; the rest are
            small grey dots that grow slightly on hover. */}
        {list.length > 1 && (
          <div className="hidden shrink-0 items-center gap-1.5 md:flex">
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
                  className={`rounded-full transition-all duration-300 ${
                    isActive
                      ? "h-2 w-6 bg-patriota-accent"
                      : "h-2 w-2 bg-white/30 hover:w-3 hover:bg-white/60"
                  }`}
                />
              );
            })}
          </div>
        )}
      </Container>
    </div>
  );
}
