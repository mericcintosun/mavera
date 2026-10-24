"use client";

import { motion, useReducedMotion } from "motion/react";
import type { JSX } from "react";
import { EASE_OUT } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

/**
 * Word mask-up headline reveal. Each word slides up from behind a clip.
 * Keeps its semantic tag; the full text is the accessible name.
 */
export function RevealText({
  text,
  as = "h2",
  className,
  highlight = [],
  delay = 0,
  once = true,
  immediate = false,
  id,
}: {
  text: string;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  /** Words (exact match, punctuation stripped) rendered in honey. */
  highlight?: string[];
  delay?: number;
  once?: boolean;
  /** Animate on mount instead of when scrolled into view. */
  immediate?: boolean;
  id?: string;
}) {
  const reduced = useReducedMotion();
  const Tag = as as "h2";
  const words = text.split(/\s+/).filter(Boolean);
  const ids = words.map((w, n) => `${n}:${w}`);
  const hl = new Set(highlight.map((w) => w.toLowerCase()));
  const isHl = (w: string) => hl.has(w.replace(/[.,;:?]/g, "").toLowerCase());

  if (reduced) {
    return (
      <Tag id={id} className={className}>
        {words.map((w, i) => (
          <span key={ids[i]} className={cn(isHl(w) && "text-honey")}>
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </Tag>
    );
  }

  const trigger = immediate
    ? { animate: "show" as const }
    : {
        whileInView: "show" as const,
        viewport: { once, amount: 0.6 },
      };

  return (
    <Tag id={id} className={className} aria-label={text}>
      <motion.span
        aria-hidden="true"
        initial="hidden"
        {...trigger}
        transition={{ staggerChildren: 0.05, delayChildren: delay }}
        className="contents"
      >
        {words.map((w, i) => (
          <span key={ids[i]}>
            <span className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom">
              <motion.span
                className={cn("inline-block", isHl(w) && "text-honey")}
                variants={{
                  hidden: { y: "105%" },
                  show: {
                    y: "0%",
                    transition: { duration: 0.8, ease: EASE_OUT },
                  },
                }}
              >
                {w}
              </motion.span>
            </span>
            {i < words.length - 1 ? " " : null}
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}
