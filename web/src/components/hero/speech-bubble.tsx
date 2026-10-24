"use client";

import { useLenis } from "lenis/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  DUR,
  EASE_OUT,
  SPRING_BOUNCY,
  SPRING_SNAPPY,
} from "@/components/motion/tokens";
import { useStatePoll } from "@/components/useStatePoll";
import { use402Challenge } from "@/hooks/use-402-challenge";
import { formatInt, formatUsdcAmount, shortHex, toBig } from "@/lib/format";
import { MEDIA, SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

const CYCLE_MS = 4500;

/** Idle lines built from live /api/state data. */
function useIdleLines(): string[] {
  const { data } = useStatePoll();
  return useMemo(() => {
    const lines: string[] = [];
    if (data?.paid_calls != null) {
      lines.push(`${formatInt(data.paid_calls)} paid calls so far.`);
    }
    if (data?.total_distributed != null) {
      lines.push(
        `$${formatUsdcAmount(toBig(data.total_distributed))} already paid to holders.`,
      );
    }
    lines.push(`A price costs ${SITE.priceUsd}. Tap to ask me.`);
    return lines;
  }, [data?.paid_calls, data?.total_distributed]);
}

/**
 * The hero's interactive proof: the bear's speech bubble is a real button that
 * asks the unpaid /api/price for a price and shows the real x402 challenge.
 */
export function SpeechBubble({ delay = 0 }: { delay?: number }) {
  const reduced = useReducedMotion() === true;
  const lines = useIdleLines();
  const [index, setIndex] = useState(0);
  const { run, status, accept, latencyMs } = use402Challenge();
  const lenis = useLenis();

  const answered = status === "ok" || status === "error";

  useEffect(() => {
    if (answered || status === "loading") return;
    const t = window.setInterval(() => setIndex((i) => i + 1), CYCLE_MS);
    return () => window.clearInterval(t);
  }, [answered, status]);

  const line = lines[index % lines.length];
  const amount = accept ? `$${formatUsdcAmount(toBig(accept.amount))}` : null;

  const showChallenge = () => {
    const el = document.getElementById("how");
    if (lenis) lenis.scrollTo("#how", { offset: -88, duration: 1.1 });
    else el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  };

  // Keep the same keys with and without reduced motion so the server HTML
  // matches the first client render; reduced motion only zeroes the duration.
  const swap = {
    initial: { opacity: 0, y: 10, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    exit: { opacity: 0, y: -10, filter: "blur(6px)" },
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { ...SPRING_BOUNCY, delay }}
      style={{ transformOrigin: "50% 100%" }}
      className="relative z-10 w-full max-w-[26rem]"
    >
      <motion.div
        layout={!reduced}
        transition={SPRING_SNAPPY}
        whileHover={reduced || status === "loading" ? undefined : { y: -2 }}
        className="relative rounded-[1.4rem] bg-honey text-[#1a1206] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]"
      >
        <motion.button
          layout={!reduced ? "position" : false}
          type="button"
          onClick={() => run()}
          disabled={status === "loading"}
          aria-label={
            answered
              ? "Ask the bear for a price again"
              : "Ask the bear for a price"
          }
          whileTap={{ scale: 0.985 }}
          transition={SPRING_SNAPPY}
          className={cn(
            "group flex w-full min-h-11 items-start gap-3.5 rounded-[1.4rem] px-5 pt-4 text-left outline-none transition-colors",
            "focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1324]",
            "disabled:cursor-progress",
            status === "ok" ? "pb-2" : "pb-4",
          )}
        >
          <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#fff7e6]/75 ring-1 ring-black/5">
            <Image
              src={MEDIA.logoMark.src}
              alt=""
              width={26}
              height={Math.round(
                (26 * MEDIA.logoMark.height) / MEDIA.logoMark.width,
              )}
              priority
            />
          </span>
          <span className="relative min-w-0 flex-1" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              {status === "ok" && accept ? (
                <motion.span
                  key="ok"
                  className="block"
                  {...swap}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { duration: DUR.base, ease: EASE_OUT }
                  }
                >
                  <span className="display block text-[1.6rem] leading-tight">
                    402 Payment Required
                  </span>
                  <span className="mt-1.5 block text-[15px] leading-snug text-[#1a1206]/85">
                    Pay{" "}
                    <span className="tabular-nums font-semibold">{amount}</span>{" "}
                    USDC to{" "}
                    <span className="font-mono text-[13.5px]">
                      {shortHex(accept.payTo)}
                    </span>{" "}
                    on Monad testnet
                  </span>
                  <span className="mt-1 block text-sm tabular-nums text-[#1a1206]/65">
                    answered in {latencyMs} ms
                  </span>
                </motion.span>
              ) : status === "error" ? (
                <motion.span
                  key="err"
                  className="block text-lg font-semibold leading-snug"
                  {...swap}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { duration: DUR.base, ease: EASE_OUT }
                  }
                >
                  The API did not answer. Try again.
                </motion.span>
              ) : status === "loading" ? (
                <motion.span
                  key="loading"
                  className="flex items-center gap-2 text-lg font-semibold leading-snug"
                  {...swap}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { duration: DUR.fast, ease: EASE_OUT }
                  }
                >
                  Asking the API
                  <span aria-hidden className="inline-flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <motion.span
                        key={d}
                        className="size-1.5 rounded-full bg-[#1a1206]/70"
                        animate={
                          reduced ? undefined : { opacity: [0.3, 1, 0.3] }
                        }
                        transition={{
                          duration: 0.9,
                          repeat: Number.POSITIVE_INFINITY,
                          delay: d * 0.15,
                        }}
                      />
                    ))}
                  </span>
                </motion.span>
              ) : (
                <motion.span
                  key={line}
                  className="block text-pretty text-lg font-semibold leading-snug sm:text-xl"
                  {...swap}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { duration: DUR.base, ease: EASE_OUT }
                  }
                >
                  {line}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </motion.button>

        <AnimatePresence initial={false}>
          {status === "ok" ? (
            <motion.div
              key="more"
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: DUR.base,
                ease: EASE_OUT,
                delay: reduced ? 0 : 0.15,
              }}
              className="flex items-center justify-between gap-3 px-5 pb-3 pl-[4.25rem]"
            >
              <button
                type="button"
                onClick={showChallenge}
                className="inline-flex min-h-11 items-center text-sm font-medium underline decoration-[#1a1206]/35 underline-offset-4 outline-none transition-colors hover:decoration-[#1a1206] focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-[#1a1206]/60"
              >
                Show the full challenge
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <span
          aria-hidden
          className="absolute -bottom-1.5 left-1/2 size-3.5 -translate-x-1/2 rotate-45 rounded-[3px] bg-honey"
        />
      </motion.div>
    </motion.div>
  );
}
