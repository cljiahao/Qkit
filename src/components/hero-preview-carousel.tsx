"use client";

// Hero visual carousel: cross-fades between a priced coffee board and a
// queue-only ice-cream board so visitors see QKit fits both a booth that
// charges and one that just runs a queue. Both boards stay mounted and are
// stacked in a single grid cell, so the taller one sizes the box and the
// height never jumps. Decorative only (the boards are aria-hidden).

import { useEffect, useState } from "react";
import { LandingBoardPreview } from "@/components/landing-board-preview";
import { LandingOrderPreviewIcecream } from "@/components/landing-order-preview-icecream";

const ROTATE_MS = 10_000;

const BOARDS = [
  { key: "coffee", Board: LandingBoardPreview },
  { key: "icecream", Board: LandingOrderPreviewIcecream },
] as const;

export function HeroPreviewCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    // Respect reduced-motion: hold on the first board, no auto-rotation and no
    // cross-fade. Otherwise swap every ROTATE_MS.
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) return;

    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % BOARDS.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div aria-hidden>
      <div className="relative grid">
        {BOARDS.map(({ key, Board }, i) => (
          <div
            key={key}
            className={
              "[grid-area:1/1] transition-opacity duration-1000 ease-out motion-reduce:transition-none " +
              (i === active ? "opacity-100" : "pointer-events-none opacity-0")
            }
          >
            <Board />
          </div>
        ))}
      </div>

      {/* Subtle progress dots. */}
      <div className="mt-4 flex items-center justify-center gap-1.5">
        {BOARDS.map(({ key }, i) => (
          <span
            key={key}
            className={
              "size-1.5 rounded-full transition-colors duration-500 " +
              (i === active ? "bg-primary" : "bg-border")
            }
          />
        ))}
      </div>
    </div>
  );
}
