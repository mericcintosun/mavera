"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { useWriteContract } from "wagmi";
import { maveraAbi } from "@/lib/abi/mavera";
import { getClientEnv } from "@/lib/env";
import {
  formatAge,
  formatInt,
  formatUsdc,
  formatUsdcAmount,
  toBig,
  ZERO,
} from "@/lib/format";
import { TxLine } from "./TxLine";
import { Button, Card, Skeleton, Stat } from "./ui";
import { STATE_QUERY_KEY, useNow, useStatePoll } from "./useStatePoll";
import { useWalletGate } from "./wallet";

/** Counts from the previous value to the new one over 600 ms (one Monad finality). */
function useCountUp(target: bigint, ready: boolean, durationMs = 600): bigint {
  const [shown, setShown] = useState(target);
  const currentRef = useRef(target);
  const primedRef = useRef(false);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const from = currentRef.current;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!primedRef.current || reduced || target <= from) {
      // First paint, reduced motion or a decrease: no animation, new baseline.
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

interface Drop {
  id: number;
  label: string;
}

export function Fountain() {
  const poll = useStatePoll();
  const state = poll.data;
  const now = useNow(1000);
  const gate = useWalletGate();
  const queryClient = useQueryClient();
  const write = useWriteContract();
  const env = getClientEnv();

  const distributed = toBig(state?.total_distributed);
  const pending = toBig(state?.pending);
  const revenue = toBig(state?.revenue_total);
  const shownDistributed = useCountUp(distributed, state !== undefined);

  // Drops and flash on every observed revenue increase (never on time fields).
  const [drops, setDrops] = useState<Drop[]>([]);
  const [flashKey, setFlashKey] = useState(0);
  const prevRevenueRef = useRef<bigint | null>(null);
  const hadErrorRef = useRef(false);
  useEffect(() => {
    if (poll.isError) {
      hadErrorRef.current = true;
      return;
    }
    if (state === undefined) {
      return;
    }
    const prev = prevRevenueRef.current;
    prevRevenueRef.current = revenue;
    if (hadErrorRef.current) {
      // First poll after an error only sets a new baseline.
      hadErrorRef.current = false;
      return;
    }
    if (prev === null || revenue <= prev) {
      return;
    }
    const id = Date.now() + Math.random();
    setDrops((list) => [
      ...list.slice(-3),
      { id, label: `+$${formatUsdcAmount(revenue - prev)}` },
    ]);
    setFlashKey((key) => key + 1);
    const timer = setTimeout(
      () => setDrops((list) => list.filter((drop) => drop.id !== id)),
      900,
    );
    return () => clearTimeout(timer);
  }, [state, revenue, poll.isError]);

  // "Sync is late" after 5 s of pending revenue.
  const pendingSinceRef = useRef<number | null>(null);
  useEffect(() => {
    if (pending > ZERO) {
      if (pendingSinceRef.current === null) {
        pendingSinceRef.current = Date.now();
      }
    } else {
      pendingSinceRef.current = null;
    }
  }, [pending]);
  const pendingForS =
    pendingSinceRef.current === null
      ? 0
      : Math.max(0, Math.floor((now - pendingSinceRef.current) / 1000));
  const late = pending > ZERO && pendingForS > 5;

  const [syncLine, setSyncLine] = useState<{
    text: string;
    hash?: string;
    tone?: "default" | "error";
  } | null>(null);
  async function syncNow() {
    try {
      setSyncLine({ text: "Syncing…" });
      const hash = await write.mutateAsync({
        abi: maveraAbi,
        address: env.NEXT_PUBLIC_MAVERA_ADDRESS as Address,
        functionName: "sync",
      });
      setSyncLine({ text: "Sync sent", hash });
      void queryClient.invalidateQueries({ queryKey: [STATE_QUERY_KEY] });
    } catch {
      setSyncLine({ text: "Sync rejected in wallet.", tone: "error" });
    }
  }

  // Freshness chip and extrapolated ages.
  const sinceFetchS = poll.dataUpdatedAt
    ? Math.max(0, (now - poll.dataUpdatedAt) / 1000)
    : 0;
  let chip = "Live";
  if (poll.isError) {
    chip = "Reconnecting…";
  } else if (sinceFetchS > 6) {
    chip = `Stale ${Math.floor(sinceFetchS)} s`;
  }
  const lastCall =
    state?.last_call_age_s === null || state?.last_call_age_s === undefined
      ? "Waiting for the first call"
      : formatAge(state.last_call_age_s + sinceFetchS);
  let claimableText = "Connect a wallet to see your share";
  if (state?.me) {
    claimableText = formatUsdc(toBig(state.me.claimable), "exact");
  } else if (gate.address) {
    claimableText = "Loading…";
  }

  return (
    <Card
      title="The fountain"
      subtitle="Every paid call is split among share holders in the same block."
      className="relative overflow-hidden"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-3 flex justify-center"
        aria-hidden="true"
      >
        {drops.map((drop) => (
          <span
            key={drop.id}
            className="animate-drop tabular absolute rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white"
          >
            {drop.label}
          </span>
        ))}
      </div>

      {state === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
          <p className="text-sm text-muted">
            {poll.isError
              ? "Could not load chain state. Retrying…"
              : "Loading chain state…"}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Stat
              label="Distributed to holders"
              value={formatUsdc(shownDistributed)}
              title={formatUsdc(distributed, "exact")}
              big
              accent
              flashKey={flashKey}
            />
            <Stat
              label="Paid calls"
              value={formatInt(state.paid_calls ?? 0)}
              big
            />
            <Stat label="Last call" value={lastCall} />
            <Stat label="Your claimable" value={claimableText} />
          </div>

          {pending > ZERO ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <p aria-live="polite">
                {late
                  ? `Sync is late (pending ${formatUsdc(pending)} for ${pendingForS} s). Anyone can trigger it.`
                  : `Pending sync: ${formatUsdc(pending)}`}
              </p>
              {late && gate.ready ? (
                <Button
                  variant="ghost"
                  className="min-h-9 px-3"
                  onClick={syncNow}
                  disabled={write.isPending}
                >
                  Sync now
                </Button>
              ) : null}
            </div>
          ) : null}
          {syncLine ? (
            <TxLine
              text={syncLine.text}
              hash={syncLine.hash}
              tone={syncLine.tone}
            />
          ) : null}

          <p className="tabular mt-5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>
              Block {formatInt(state.block_number)} · final{" "}
              {formatInt(state.finalized_block)}
            </span>
            <span className="rounded-full border border-line px-2 py-0.5">
              {chip}
            </span>
            {state.last_price?.price_usd ? (
              <span>Last served MON/USD ${state.last_price.price_usd}</span>
            ) : null}
          </p>
        </>
      )}
    </Card>
  );
}
