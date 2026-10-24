"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { useWriteContract } from "wagmi";
import { EASE_OUT, SPRING_SNAPPY } from "@/components/motion/tokens";
import { DevicePanel } from "@/components/primitives/device-panel";
import { NumberTicker } from "@/components/primitives/number-ticker";
import { Pill } from "@/components/primitives/pill";
import { TxLink } from "@/components/primitives/tx-link";
import { Skeleton } from "@/components/ui/skeleton";
import {
  STATE_QUERY_KEY,
  useNow,
  useStatePoll,
} from "@/components/useStatePoll";
import { useWalletGate } from "@/components/wallet";
import { useHolders } from "@/hooks/use-holders";
import { maveraAbi } from "@/lib/abi/mavera";
import { getClientEnv, isDeployedAddress } from "@/lib/env";
import {
  formatAge,
  formatInt,
  formatShares,
  formatUsdc,
  formatUsdcAmount,
  isUserRejected,
  percentOfSupply,
  toBig,
  ZERO,
} from "@/lib/format";
import { KNOWN_TXS } from "@/lib/site";
import { cn } from "@/lib/utils";
import { HoneyStream } from "./honey-stream";
import { type RevenueEvent, useRevenueEvents } from "./use-revenue-events";

type Variant = "device" | "projector";

const PROOF_ROWS = [
  { label: "First settlement", hash: KNOWN_TXS.firstSettlement },
  { label: "First sync", hash: KNOWN_TXS.firstSync },
  { label: "First claim", hash: KNOWN_TXS.claim },
] as const;

/**
 * The live payout panel: total paid to holders, three chain facts, the jar
 * and cups scene, and a feed of payments seen in this session. Every number
 * comes from /api/state (chain reads every 2 s) or the holder multicall.
 */
export function FountainPanel({ variant = "device" }: { variant?: Variant }) {
  const projector = variant === "projector";
  const poll = useStatePoll();
  const state = poll.data;
  const now = useNow(1000);
  const gate = useWalletGate();
  const queryClient = useQueryClient();
  const write = useWriteContract();
  const env = getClientEnv();
  const holders = useHolders();

  const distributed = toBig(state?.total_distributed);
  const pending = toBig(state?.pending);
  const { events, latestId } = useRevenueEvents(state, poll.isError);

  // Pending for more than 5 s: offer a permissionless sync.
  const pendingSinceRef = useRef<number | null>(null);
  useEffect(() => {
    if (pending > ZERO) {
      pendingSinceRef.current ??= Date.now();
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
      setSyncLine({ text: "Sync sent.", hash });
      void queryClient.invalidateQueries({ queryKey: [STATE_QUERY_KEY] });
    } catch (error) {
      setSyncLine({
        text: isUserRejected(error)
          ? "Sync rejected in wallet."
          : "Sync failed. Try again.",
        tone: "error",
      });
    }
  }

  const sinceFetchS = poll.dataUpdatedAt
    ? Math.max(0, (now - poll.dataUpdatedAt) / 1000)
    : 0;
  const lastCall =
    state?.last_call_age_s === null || state?.last_call_age_s === undefined
      ? null
      : formatAge(state.last_call_age_s + sinceFetchS);

  const deployed = isDeployedAddress(env.NEXT_PUBLIC_MAVERA_ADDRESS);
  const me = state?.me ?? null;
  const position = me
    ? `You hold ${formatShares(toBig(me.shares))} shares (${percentOfSupply(
        toBig(me.shares),
        toBig(state?.total_supply),
      )}%) and can claim ${formatUsdc(toBig(me.claimable), "exact")}.`
    : null;

  const loading = state === undefined;
  const latestSettlement =
    state?.last_settlement_tx ?? KNOWN_TXS.preflightSettlement;

  return (
    <DevicePanel
      glow="none"
      className={cn("p-5 sm:p-8", projector && "lg:px-14 lg:py-12")}
    >
      <div
        className={cn(
          "grid gap-8 lg:items-center",
          projector
            ? "lg:grid-cols-[1.05fr_0.95fr] lg:gap-16"
            : "lg:grid-cols-[1.1fr_0.9fr] lg:gap-12",
        )}
      >
        {/* Hero number + facts */}
        <div className="order-2 min-w-0 lg:order-1">
          <Freshness
            error={poll.isError}
            seconds={Math.floor(sinceFetchS)}
            loading={loading}
          />
          <div className="mt-4">
            {loading ? (
              <Skeleton
                className={cn(
                  "rounded-2xl bg-white/10",
                  projector ? "h-28 w-80" : "h-20 w-64",
                )}
              />
            ) : (
              <p
                className="flex flex-col items-start gap-3"
                title={formatUsdc(distributed, "exact")}
              >
                <NumberTicker
                  value={`$${formatUsdcAmount(distributed)}`}
                  className={cn(
                    "display leading-none text-cream",
                    projector
                      ? "text-7xl sm:text-8xl 2xl:text-[10rem]"
                      : "text-7xl sm:text-8xl",
                  )}
                />
                <span
                  className={cn(
                    "text-muted-foreground",
                    projector ? "text-xl sm:text-2xl" : "text-base sm:text-lg",
                  )}
                >
                  USDC paid to holders
                </span>
              </p>
            )}
          </div>

          <dl
            className={cn(
              "mt-8 grid grid-cols-[1fr_1fr_1.4fr] divide-x sm:grid-cols-3 divide-white/[0.08] border-y border-white/[0.08]",
              projector && "mt-10",
            )}
          >
            <Fact label="Paid calls" projector={projector}>
              {loading ? (
                <FactSkeleton />
              ) : (
                <NumberTicker value={formatInt(state.paid_calls ?? 0)} />
              )}
            </Fact>
            <Fact label="Pending" projector={projector}>
              {loading ? (
                <FactSkeleton />
              ) : (
                <span className={cn(pending > ZERO && "text-honey")}>
                  <NumberTicker value={`$${formatUsdcAmount(pending)}`} />
                </span>
              )}
            </Fact>
            <Fact label="Latest block" projector={projector}>
              {loading ? (
                <FactSkeleton />
              ) : (
                <BlockNumber value={state.block_number} />
              )}
            </Fact>
          </dl>

          {/* Sync offer */}
          <AnimatePresence initial={false}>
            {late || syncLine ? (
              <motion.div
                key="sync"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
                className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-muted-foreground"
                aria-live="polite"
              >
                {late ? (
                  <Pill
                    variant="secondary"
                    onClick={gate.ready ? syncNow : (gate.action ?? undefined)}
                    disabled={write.isPending || (!gate.ready && gate.disabled)}
                    loading={write.isPending}
                  >
                    {write.isPending
                      ? "Syncing…"
                      : gate.ready
                        ? "Sync now"
                        : (gate.label ?? "Sync now")}
                  </Pill>
                ) : null}
                {late ? (
                  <span>
                    Pending for {pendingForS} s. Anyone can call sync().
                  </span>
                ) : null}
                {syncLine ? (
                  <span
                    className={cn(
                      syncLine.tone === "error" && "text-destructive",
                    )}
                  >
                    {syncLine.text}
                    {syncLine.hash ? (
                      <>
                        {" "}
                        <TxLink hash={syncLine.hash} />
                      </>
                    ) : null}
                  </span>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Scene */}
        <div className="order-1 lg:order-2">
          <HoneyStream
            latestId={latestId}
            latestAmount={events[0]?.amount ?? null}
            holders={holders.rows}
            projector={projector}
            className={projector ? "max-w-xl" : "max-w-md"}
          />
        </div>
      </div>

      {/* Feed + last call + position */}
      <div
        className={cn(
          "mt-8 grid gap-6 border-t border-white/[0.08] pt-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12",
          projector && "hidden lg:grid [@media(max-height:820px)]:hidden",
        )}
      >
        <div className="min-w-0">
          <h3 className="text-sm text-muted-foreground">
            {events.length > 0
              ? "Payments seen since you opened this page"
              : "On-chain proof"}
          </h3>
          <Feed events={events} now={now} />
        </div>
        <div className="flex min-w-0 flex-col gap-1 text-sm text-muted-foreground lg:pt-8">
          <p className="tabular flex min-h-11 flex-wrap items-center gap-x-1.5">
            {lastCall ? (
              <>
                Last paid call <span className="text-cream">{lastCall}</span>
              </>
            ) : (
              <>
                Known settlement{" "}
                <TxLink hash={latestSettlement} className="min-h-11" />
              </>
            )}
          </p>
          {state?.last_sync_tx ? (
            <p className="tabular flex min-h-11 flex-wrap items-center gap-x-1.5">
              Latest sync{" "}
              <TxLink hash={state.last_sync_tx} className="min-h-11" />
            </p>
          ) : null}
          {deployed ? (
            <p className="tabular flex min-h-11 flex-wrap items-center gap-x-1.5">
              Contract{" "}
              <TxLink
                hash={env.NEXT_PUBLIC_MAVERA_ADDRESS}
                kind="address"
                className="min-h-11"
              />
            </p>
          ) : null}
          <p aria-live="polite" className={cn(position && "text-cream")}>
            {position ??
              (gate.address
                ? "Loading your position…"
                : "Connect a wallet to see your share.")}
          </p>
        </div>
      </div>
    </DevicePanel>
  );
}

function Feed({ events, now }: { events: RevenueEvent[]; now: number }) {
  const reduced = useReducedMotion() ?? false;
  if (events.length === 0) {
    return (
      <ul className="mt-3 divide-y divide-white/[0.06]">
        {PROOF_ROWS.map((row) => (
          <li
            key={row.label}
            className="flex min-h-11 items-center justify-between gap-4 py-0.5 text-sm"
          >
            <span className="text-cream">{row.label}</span>
            <TxLink hash={row.hash} className="min-h-11 px-1" />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="mt-3 divide-y divide-white/[0.06]" aria-live="polite">
      <AnimatePresence initial={false}>
        {events.slice(0, 6).map((event) => (
          <motion.li
            key={event.id}
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={SPRING_SNAPPY}
            className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm"
          >
            <span className="text-cream">
              <span className="tabular text-honey">
                +${formatUsdcAmount(event.amount)}
              </span>{" "}
              split among holders
            </span>
            <span className="tabular text-muted-foreground">
              {formatAge(Math.max(0, (now - event.at) / 1000))}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function BlockNumber({ value }: { value: number }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <span className="inline-flex items-center gap-2">
      <motion.span
        key={value}
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-mint"
        initial={reduced ? false : { scale: 2.2, opacity: 0.3 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={SPRING_SNAPPY}
      />
      <span className="tabular">{formatInt(value)}</span>
    </span>
  );
}

function Freshness({
  error,
  seconds,
  loading,
}: {
  error: boolean;
  seconds: number;
  loading: boolean;
}) {
  const live = !error && !loading && seconds <= 6;
  return (
    <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          live ? "bg-mint" : "bg-muted-foreground",
        )}
      />
      <span className="tabular">
        {loading
          ? "Reading Monad testnet…"
          : error
            ? "Reconnecting to Monad testnet…"
            : `Read from Monad testnet ${seconds} s ago`}
      </span>
    </p>
  );
}

function Fact({
  label,
  children,
  projector,
}: {
  label: string;
  children: ReactNode;
  projector: boolean;
}) {
  return (
    <div className="min-w-0 px-2 py-4 first:pl-0 sm:px-5">
      <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
      <dd
        className={cn(
          "tabular mt-1.5 flex min-h-8 items-center truncate text-cream",
          projector ? "text-xl 2xl:text-3xl" : "text-base sm:text-xl",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function FactSkeleton() {
  return (
    <Skeleton className="inline-block h-5 w-16 bg-white/10 align-middle" />
  );
}
