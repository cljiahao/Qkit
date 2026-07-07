"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Back-to-top button for the long landing page (NN/g: worth it past ~4 screens).
 * Appears once the visitor is ~one viewport down and disappears near the top;
 * bottom-right where people expect it, a real focusable <button>, and it scrolls
 * smoothly unless the visitor prefers reduced motion (then it jumps instantly).
 */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function toTop() {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      className={cn(
        "fixed right-6 bottom-6 z-40 grid size-12 place-items-center rounded-full border border-border bg-background/90 text-foreground shadow-lg backdrop-blur transition-all outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none",
        show
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ArrowUp className="size-5" />
    </button>
  );
}
