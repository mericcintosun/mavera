"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TxLink } from "@/components/primitives/tx-link";
import { formatMon } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Quiet "pending -> visible -> final" line with the explorer link and fee. */
export function TxLine({
  text,
  hash,
  block,
  fee,
  finalizedBlock,
  tone = "default",
  className,
}: {
  text: string;
  hash?: string;
  block?: number;
  fee?: bigint;
  finalizedBlock?: number;
  tone?: "default" | "error";
  className?: string;
}) {
  const reduced = useReducedMotion();
  const final =
    block !== undefined &&
    finalizedBlock !== undefined &&
    finalizedBlock >= block;
  const pending = block === undefined && tone !== "error";
  return (
    <motion.p
      aria-live="polite"
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "tabular mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-relaxed",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {pending ? (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-honey motion-safe:animate-pulse"
        />
      ) : null}
      <span className={tone === "error" ? undefined : "text-cream"}>
        {text}
      </span>
      <AnimatePresence initial={false}>
        {block !== undefined ? (
          <motion.span
            key={final ? "final" : "visible"}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className={final ? "text-mint" : undefined}
          >
            {final ? "final" : "visible, waiting for finality"}
          </motion.span>
        ) : null}
      </AnimatePresence>
      {hash ? <TxLink hash={hash} /> : null}
      {fee !== undefined ? <span>fee {formatMon(fee)}</span> : null}
    </motion.p>
  );
}
