"use client";

import { NumberTicker } from "@/components/primitives/number-ticker";
import { useStatePoll } from "@/components/useStatePoll";
import { formatInt, formatUsdcAmount, toBig } from "@/lib/format";

/** One quiet live line under the hero CTAs, read from the chain via /api/state. */
export function LiveLine() {
  const { data, isError } = useStatePoll();
  const ready = data?.total_distributed != null && data?.paid_calls != null;

  return (
    <p className="flex min-h-6 flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
      <span className="relative mr-1 inline-flex size-2" aria-hidden>
        {ready ? (
          <span className="absolute inset-0 animate-ping rounded-full bg-mint/60 motion-reduce:hidden" />
        ) : null}
        <span
          className={
            ready
              ? "relative size-2 rounded-full bg-mint"
              : "relative size-2 rounded-full bg-white/25"
          }
        />
      </span>
      {ready && data ? (
        <>
          <span className="inline-flex items-center gap-x-1.5 whitespace-nowrap">
            <NumberTicker
              className="relative top-[0.12em] font-medium leading-none text-cream"
              value={`$${formatUsdcAmount(toBig(data.total_distributed))}`}
            />
            <span className="leading-none">paid to holders</span>
          </span>
          <span className="inline-flex items-center gap-x-1.5 whitespace-nowrap">
            <span className="leading-none">from</span>
            <NumberTicker
              className="relative top-[0.12em] font-medium leading-none text-cream"
              value={formatInt(data.paid_calls ?? 0)}
            />
            <span className="leading-none">calls on Monad testnet</span>
          </span>
        </>
      ) : (
        <span>
          {isError
            ? "Live totals are unavailable right now."
            : "Reading the totals from Monad testnet"}
        </span>
      )}
    </p>
  );
}
