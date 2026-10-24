"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a bigint from its previous value to `target` over `durationMs`
 * (default 600 ms, one Monad finality). First paint, decreases and
 * prefers-reduced-motion snap instantly.
 */
export function useCountUp(
  target: bigint,
  ready = true,
  durationMs = 600,
): bigint {
  const [shown, setShown] = useState(target);
  const currentRef = useRef(target);
  const primedRef = useRef(false);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const from = currentRef.current;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!primedRef.current || reduced || target <= from) {
      primedRef.current = true;
      currentRef.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const delta = Number(target - from);
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const value = t >= 1 ? target : from + BigInt(Math.round(delta * eased));
      currentRef.current = value;
      setShown(value);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ready, durationMs]);

  return shown;
}
