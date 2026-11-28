"use client";

import { useEffect, useRef, useState } from "react";

/* end: static final image (server render, no JS, reduced motion, already visible on mount).
   ready: below the viewport, waiting. play: one-shot growth, then the same final image. */
export type GrowState = "end" | "ready" | "play";

export function useGrowOnView<T extends Element>(replay = false) {
  const ref = useRef<T>(null);
  const [state, setState] = useState<GrowState>("end");

  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = element.getBoundingClientRect();
    // Never hide content the visitor already reads, unless the visitor asked for it (replay).
    if (!replay && rect.top < window.innerHeight * 0.85) return;
    setState("ready");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setState("play");
        observer.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [replay]);

  return [ref, state] as const;
}
