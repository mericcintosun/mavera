"use client";

import { useEffect, useState } from "react";

/**
 * Id of the nav section under the probe line (35% from the top of the
 * viewport), or null between tracked sections. At the very bottom of the page
 * the last tracked section wins, so a short final section (FAQ) still becomes
 * active even though it can never reach the probe line. rAF-throttled scroll
 * and resize listeners; works with Lenis because Lenis scrolls the window.
 */
export function useScrollSpy(ids: string[], probe = 0.35): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("|");

  useEffect(() => {
    const list = key.split("|").filter(Boolean);
    let frame = 0;

    const compute = () => {
      frame = 0;
      const doc = document.documentElement;
      const atBottom =
        window.scrollY + window.innerHeight >= doc.scrollHeight - 4;
      if (atBottom) {
        for (let i = list.length - 1; i >= 0; i--) {
          if (document.getElementById(list[i])) {
            setActive(list[i]);
            return;
          }
        }
      }
      const line = window.innerHeight * probe;
      let next: string | null = null;
      for (const id of list) {
        const el = document.getElementById(id);
        if (!el) {
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (rect.top <= line && rect.bottom > line) {
          next = id;
        }
      }
      setActive(next);
    };

    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(compute);
      }
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, [key, probe]);

  return active;
}
