"use client";

import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Icon button that copies `value`; the icon morphs Copy -> Check. */
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          toast("Copied");
        } catch {
          toast("Copy failed");
        }
      }}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-white/8 hover:text-cream focus-visible:ring-2 focus-visible:ring-honey active:bg-white/12 disabled:opacity-45",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={done ? "check" : "copy"}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.15 }}
          className="inline-flex"
        >
          {done ? (
            <Check aria-hidden="true" className="size-4 text-mint" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
