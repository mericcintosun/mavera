"use client";

import { motion, useReducedMotion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder shaped like a form (heading, sentence, action). */
export function FormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="h-8 w-2/3 rounded-lg bg-white/5" />
      <Skeleton className="h-4 w-full rounded bg-white/5" />
      <Skeleton className="mt-8 h-12 w-full rounded-full bg-white/5" />
    </div>
  );
}

const COINS = Array.from({ length: 8 }, (_, i) => {
  const angle = -Math.PI / 2 + ((i - 3.5) / 3.5) * (Math.PI / 2.4);
  const dist = 70 + (i % 3) * 18;
  return {
    id: `coin-${i}`,
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    delay: i * 0.025,
  };
});

/**
 * Eight honey coins that burst up from the centre of the parent once per
 * `burstKey` change. Reduced motion renders nothing.
 */
export function CoinBurst({ burstKey }: { burstKey: number }) {
  const reduced = useReducedMotion();
  if (reduced || burstKey === 0) {
    return null;
  }
  return (
    <span
      key={burstKey}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      {COINS.map((c) => (
        <motion.span
          key={c.id}
          className="absolute size-3 rounded-full bg-honey shadow-[inset_0_-2px_0_rgba(0,0,0,0.25)] will-change-transform"
          initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
          animate={{ x: c.x, y: c.y, scale: 1, opacity: 0 }}
          transition={{
            duration: 0.8,
            delay: c.delay,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      ))}
    </span>
  );
}
