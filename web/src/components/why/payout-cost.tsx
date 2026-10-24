"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { SPRING_SNAPPY } from "@/components/motion/tokens";
import { NumberTicker } from "@/components/primitives/number-ticker";
import { Slider } from "@/components/ui/slider";

// docs/08 "Numbers to cite": one sync() at a 200,000-gas limit and the
// 100 MON-gwei floor is 0.0204 MON, about USD 0.0004.
const SYNC_COST_USD = 0.0004;
// Logarithmic 1-2-5 steps from $0.001 to $0.10 per call.
const PRICES = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1] as const;
const DEFAULT_INDEX = 3; // $0.01, the demo price

function formatPrice(p: number) {
  return `$${p < 0.01 ? p.toFixed(3) : p.toFixed(2)}`;
}

function formatShare(pct: number) {
  return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function sentence(price: number, pct: number) {
  const p = formatPrice(price);
  if (price === 0.01) {
    return `At ${p} per call, distribution costs under 5%.`;
  }
  if (pct >= 20) {
    return `At ${p} per call, distribution eats ${formatShare(pct)} of each call. Batch several calls into one sync().`;
  }
  return `At ${p} per call, distribution costs about ${formatShare(pct)}.`;
}

/** Slider: price per call against the fixed cost of one sync() distribution. */
export function PayoutCost() {
  const [index, setIndex] = useState(DEFAULT_INDEX);
  const reduced = useReducedMotion();
  const price = PRICES[index] ?? 0.01;
  const pct = (SYNC_COST_USD / price) * 100;

  return (
    <div className="flex flex-col gap-8">
      <div className="max-w-md">
        <h3 className="display text-2xl text-cream sm:text-3xl">
          What a payout costs.
        </h3>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          One sync() distribution costs about $0.0004 whatever the call price.
          Move the price and see how much of each call it takes, if every call
          gets its own sync().
        </p>
      </div>

      <div className="grid gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <label
              htmlFor="why-price"
              className="text-sm text-muted-foreground"
            >
              Price per call
            </label>
            <NumberTicker
              value={formatPrice(price)}
              digitClassName="align-top"
              className="font-mono text-base leading-none text-honey"
            />
          </div>
          <Slider
            id="why-price"
            aria-label="Price per call"
            aria-valuetext={`${formatPrice(price)} per call`}
            min={0}
            max={PRICES.length - 1}
            step={1}
            value={[index]}
            onValueChange={(v) => setIndex(v[0] ?? DEFAULT_INDEX)}
            className="py-3 [&_[data-slot=slider-range]]:h-full [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>$0.001</span>
            <span>$0.10</span>
          </div>
        </div>
        <div className="sm:min-w-44 sm:text-right">
          <NumberTicker
            value={formatShare(pct)}
            digitClassName="align-top"
            className="display text-6xl leading-none text-cream sm:text-7xl"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            of each call goes to gas
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.07]">
          <motion.div
            className="absolute inset-0 origin-left rounded-full bg-honey"
            initial={false}
            animate={{ scaleX: Math.min(pct / 100, 1) }}
            transition={reduced ? { duration: 0 } : SPRING_SNAPPY}
          />
        </div>
        <p className="text-base text-cream" aria-live="polite">
          {sentence(price, pct)}
        </p>
      </div>
    </div>
  );
}
