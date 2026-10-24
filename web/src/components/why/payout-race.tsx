"use client";

import { Check } from "lucide-react";
import {
  AnimatePresence,
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DUR, EASE_OUT, SPRING_SNAPPY } from "@/components/motion/tokens";
import { NumberTicker } from "@/components/primitives/number-ticker";
import { Pill } from "@/components/primitives/pill";
import { cn } from "@/lib/utils";

// docs/08 "Numbers to cite": visible ~300 ms, final ~600 ms on Monad;
// 12 s blocks on the Ethereum contrast row.
const MONAD_FINAL_MS = 600;
const MONAD_VISIBLE_MS = 300;
const SLOW_BLOCK_MS = 12_000;

type Phase = "idle" | "running" | "done";

function formatMs(ms: number) {
  return `${Math.round(ms).toLocaleString("en-US")}\u00a0ms`;
}

function Lane({
  name,
  t,
  totalMs,
  elapsed,
  finished,
  ticks,
}: {
  name: string;
  t: MotionValue<number>;
  totalMs: number;
  elapsed: number;
  finished: boolean;
  ticks?: { at: number; label: string }[];
}) {
  const scaleX = useTransform(t, [0, totalMs], [0, 1], { clamp: true });
  const reduced = useReducedMotion();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="flex items-center gap-2 text-sm text-cream">
          {name}
          <AnimatePresence initial={false}>
            {finished ? (
              <motion.span
                key="check"
                initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SPRING_SNAPPY}
                className="inline-flex size-5 items-center justify-center rounded-full bg-mint text-[#06281a]"
              >
                <Check
                  aria-hidden="true"
                  className="size-3.5"
                  strokeWidth={3}
                />
                <span className="sr-only">finished</span>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
        <NumberTicker
          value={formatMs(Math.min(elapsed, totalMs))}
          digitClassName="align-top"
          className={cn(
            "font-mono text-sm leading-none",
            finished ? "text-mint" : "text-muted-foreground",
          )}
        />
      </div>
      <div className="relative h-2 rounded-full bg-white/[0.07]">
        <motion.div
          className={cn(
            "absolute inset-0 origin-left rounded-full",
            finished ? "bg-mint" : "bg-cream/60",
          )}
          style={{ scaleX }}
        />
        {ticks?.map((tick) => (
          <span
            key={tick.at}
            aria-hidden="true"
            className="absolute -top-1 h-4 w-px bg-cream/40"
            style={{ left: `${(tick.at / totalMs) * 100}%` }}
          />
        ))}
      </div>
      {ticks ? (
        <div className="relative h-4 text-xs text-muted-foreground">
          {ticks.map((tick) => {
            const end = tick.at >= totalMs;
            return (
              <span
                key={tick.at}
                className={cn(
                  "absolute whitespace-nowrap",
                  end ? "right-0" : "-translate-x-1/2",
                )}
                style={
                  end ? undefined : { left: `${(tick.at / totalMs) * 100}%` }
                }
              >
                {tick.label}
              </span>
            );
          })}
        </div>
      ) : (
        <div className="h-4 text-xs text-muted-foreground">
          One block every 12 s
        </div>
      )}
    </div>
  );
}

/** Two lanes race one payout: Monad testnet against a 12-second block chain. */
export function PayoutRace() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const t = useMotionValue(0);
  const raf = useRef<number | null>(null);
  const reduced = useReducedMotion();

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    stop();
    t.set(0);
    setElapsed(0);
    setPhase("running");
    const t0 = performance.now();
    let lastBucket = -1;
    const step = (now: number) => {
      const ms = Math.min(now - t0, SLOW_BLOCK_MS);
      t.set(ms);
      // Re-render only every 40 ms for the tickers; bars read the motion value.
      const bucket = Math.floor(ms / 40);
      if (bucket !== lastBucket) {
        lastBucket = bucket;
        setElapsed(ms);
      }
      if (ms < SLOW_BLOCK_MS) {
        raf.current = requestAnimationFrame(step);
      } else {
        setElapsed(SLOW_BLOCK_MS);
        setPhase("done");
        raf.current = null;
      }
    };
    raf.current = requestAnimationFrame(step);
  }, [stop, t]);

  const monadDone = phase !== "idle" && elapsed >= MONAD_FINAL_MS;
  const slowDone = phase === "done";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-md">
          <h3 className="display text-2xl text-cream sm:text-3xl">
            Race one payout.
          </h3>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
            One paid call lands. How long until the holders can see their share
            of it?
          </p>
        </div>
        <Pill
          variant={phase === "idle" ? "primary" : "secondary"}
          onClick={start}
          disabled={phase === "running" && !monadDone}
          className="self-start sm:self-auto"
        >
          {phase === "idle" ? "Send one call" : "Race again"}
        </Pill>
      </div>

      <div className="flex flex-col gap-8">
        <Lane
          name="Monad testnet"
          t={t}
          totalMs={MONAD_FINAL_MS}
          elapsed={elapsed}
          finished={monadDone}
          ticks={[
            { at: MONAD_VISIBLE_MS, label: "visible ~300 ms" },
            { at: MONAD_FINAL_MS, label: "final ~600 ms" },
          ]}
        />
        <Lane
          name="A 12-second block chain"
          t={t}
          totalMs={SLOW_BLOCK_MS}
          elapsed={elapsed}
          finished={slowDone}
        />
      </div>

      <div className="min-h-6" aria-live="polite">
        <AnimatePresence>
          {monadDone && !slowDone ? (
            <motion.p
              key="have"
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.base, ease: EASE_OUT }}
              className="text-base text-cream"
            >
              Holders already have it.{" "}
              <span className="text-muted-foreground">
                The other chain has not produced its next block.
              </span>
            </motion.p>
          ) : slowDone ? (
            <motion.p
              key="slow"
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.base, ease: EASE_OUT }}
              className="text-base text-muted-foreground"
            >
              Twelve seconds for one block, and finality takes longer still. On
              Monad the payout was final at about 600 ms.
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
