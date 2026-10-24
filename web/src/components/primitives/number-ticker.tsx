"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SPRING_SOFT } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function DigitColumn({
  digit,
  className,
}: {
  digit: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-block h-[1em] overflow-hidden leading-none",
        className,
      )}
      style={{ width: "1ch" }}
    >
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-digit}em` }}
        transition={SPRING_SOFT}
      >
        {DIGITS.map((d) => (
          <span key={d} className="block h-[1em] text-center leading-none">
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * Digit-roll ticker for an already formatted value ("$0.37", "1,204").
 * Digits roll with SPRING_SOFT, other characters are static. Columns are keyed
 * from the right so the units place stays stable when the value grows.
 * The full value is announced politely via a visually hidden live region.
 */
export function NumberTicker({
  value,
  className,
  digitClassName,
}: {
  value: string;
  className?: string;
  digitClassName?: string;
}) {
  const reduced = useReducedMotion();
  const chars = value.split("");
  const n = chars.length;
  return (
    <span className={cn("inline-flex items-baseline tabular-nums", className)}>
      <span className="sr-only" aria-live="polite">
        {value}
      </span>
      {reduced ? (
        <span aria-hidden="true">{value}</span>
      ) : (
        <span aria-hidden="true" className="inline-flex items-baseline">
          <AnimatePresence initial={false} mode="popLayout">
            {chars.map((c, i) => {
              const key = `${n - i}`;
              const isDigit = c >= "0" && c <= "9";
              return (
                <motion.span
                  key={isDigit ? `d${key}` : `c${key}${c}`}
                  layout="position"
                  initial={{ opacity: 0, y: "0.4em" }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: "-0.4em" }}
                  transition={SPRING_SOFT}
                  className="inline-block"
                >
                  {isDigit ? (
                    <DigitColumn digit={Number(c)} className={digitClassName} />
                  ) : (
                    <span className="inline-block leading-none">{c}</span>
                  )}
                </motion.span>
              );
            })}
          </AnimatePresence>
        </span>
      )}
    </span>
  );
}
