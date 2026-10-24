"use client";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { DUR, EASE_OUT, SPRING_SNAPPY } from "@/components/motion/tokens";
import { HolderAvatar } from "@/components/primitives/holder-avatar";
import { JsonView } from "@/components/primitives/json-view";
import { NumberTicker } from "@/components/primitives/number-ticker";
import { Pill, PillLink } from "@/components/primitives/pill";
import { TxLink } from "@/components/primitives/tx-link";
import { useStatePoll } from "@/components/useStatePoll";
import type { use402Challenge } from "@/hooks/use-402-challenge";
import { useHolders } from "@/hooks/use-holders";
import { getClientEnv } from "@/lib/env";
import { formatUsdc, formatUsdcAmount } from "@/lib/format";
import { KNOWN_TXS, MEASURED } from "@/lib/site";
import { cn } from "@/lib/utils";

export type StepKey = "ask" | "sign" | "settle" | "split" | "claim";

const PRICE_UNITS = BigInt(10000);

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/* ---------- 1. Ask: the live 402 challenge ---------- */
export type Challenge = ReturnType<typeof use402Challenge>;

function AskDevice({ c }: { c: Challenge }) {
  const { run, status } = c;
  return (
    <div className="space-y-4">
      <div className="font-mono text-[13px] leading-relaxed">
        <p className="text-cream">
          <span className="text-muted-foreground">$ </span>GET /api/price
          <span className="text-muted-foreground"> (no payment header)</span>
        </p>
        <p aria-live="polite" className="text-sky">
          {status === "loading"
            ? "waiting for the server..."
            : status === "ok"
              ? `HTTP ${c.httpStatus} Payment Required`
              : status === "error"
                ? (c.error ?? "Request failed")
                : "not sent yet"}
        </p>
      </div>
      <div className="hairline" />
      {c.challenge ? (
        <JsonView
          animate
          value={{
            x402Version: c.challenge.x402Version,
            accepts: c.challenge.accepts,
          }}
          highlight={["accepts.0.amount", "accepts.0.payTo"]}
          annotations={{
            "accepts.0.amount": "10,000 units = $0.01 USDC",
            "accepts.0.network": "Monad testnet",
            "accepts.0.scheme": "exact",
          }}
          className="max-w-full overflow-x-auto text-[12px]"
        />
      ) : (
        <div className="h-40 animate-pulse rounded-lg bg-white/[0.04]" />
      )}
      {c.challenge ? (
        <Caption>payTo is the Mavera contract, not the operator.</Caption>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Pill
          variant="secondary"
          loading={status === "loading"}
          onClick={() => run()}
        >
          Send again
        </Pill>
        {c.latencyMs !== null ? (
          <span className="tabular text-sm text-muted-foreground">
            Answered in {Math.round(c.latencyMs)} ms
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- 2. Sign: EIP-712 TransferWithAuthorization ---------- */
const HEX = "0123456789abcdef";
function randomNonce(): string {
  let s = "0x";
  for (let i = 0; i < 64; i++) s += HEX[Math.floor(Math.random() * 16)];
  return s;
}

function useScrambledNonce(active: boolean, reduced: boolean): string {
  const [nonce, setNonce] = useState(
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  );
  useEffect(() => {
    setNonce(randomNonce());
    if (!active) return;
    let frame = 0;
    let scramble: ReturnType<typeof setInterval> | undefined;
    const roll = () => {
      const target = randomNonce();
      if (reduced) {
        setNonce(target);
        return;
      }
      frame = 0;
      clearInterval(scramble);
      scramble = setInterval(() => {
        frame += 1;
        const fixed = Math.min(66, 2 + frame * 6);
        setNonce(
          target.slice(0, fixed) +
            randomNonce()
              .slice(fixed)
              .slice(0, 66 - fixed),
        );
        if (fixed >= 66) clearInterval(scramble);
      }, 40);
    };
    const id = setInterval(roll, 3500);
    return () => {
      clearInterval(id);
      clearInterval(scramble);
    };
  }, [active, reduced]);
  return nonce;
}

function SignDevice({ active, c }: { active: boolean; c: Challenge }) {
  const reduced = Boolean(useReducedMotion());
  const env = getClientEnv();
  const payTo = c.accept?.payTo ?? env.NEXT_PUBLIC_MAVERA_ADDRESS;
  const [validBefore, setValidBefore] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = Math.floor(Date.now() / 1000);
    setValidBefore(t + 300);
    setNow(t);
    const id = setInterval(() => {
      const n = Math.floor(Date.now() / 1000);
      setNow(n);
      setValidBefore((v) => (v - n <= 0 ? n + 300 : v));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const nonce = useScrambledNonce(active, reduced);
  const left = Math.max(0, validBefore - now);
  const value = {
    domain: {
      name: "USDC",
      version: "2",
      chainId: 10143,
      verifyingContract: env.NEXT_PUBLIC_USDC_ADDRESS,
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: "your wallet",
      to: payTo,
      value: "10000",
      validAfter: "0",
      validBefore: String(validBefore),
      nonce,
    },
  };
  return (
    <div className="space-y-4">
      <JsonView
        value={value}
        highlight={["message.to", "message.value"]}
        annotations={{
          "message.to": "payTo from the 402",
          "message.value": "$0.01 USDC",
          "message.validBefore": `expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`,
          "message.nonce": "random, used once",
        }}
        className="max-w-full overflow-x-auto text-[12.5px]"
      />
      <div className="hairline" />
      <Caption>One signature. No gas, no account.</Caption>
    </div>
  );
}

/* ---------- 3. Settle: a coin travels the real settlement path ---------- */
const SETTLE_NODES = [
  { key: "agent", label: "Agent", note: "signs once" },
  { key: "facilitator", label: "Facilitator", note: "pays the gas" },
  { key: "usdc", label: "USDC", note: "moves $0.01" },
  { key: "mavera", label: "Mavera", note: "receives it" },
] as const;

type SettleKey = (typeof SETTLE_NODES)[number]["key"];

const TRAVEL_S = 1.8;
const HOLD_MS = 1500;

function SettleGlyph({ k }: { k: SettleKey }) {
  if (k === "agent") {
    return <HolderAvatar who="robot" size={44} />;
  }
  if (k === "mavera") {
    return <HolderAvatar who="bear" size={44} />;
  }
  if (k === "usdc") {
    return (
      <span className="grid size-11 place-items-center rounded-full bg-[#2775ca] text-lg font-semibold text-white">
        $
      </span>
    );
  }
  return (
    <span className="grid size-11 place-items-center rounded-full bg-[#16213a] font-mono text-[11px] text-sky ring-1 ring-sky/30">
      x402
    </span>
  );
}

function SettleDevice({ active }: { active: boolean }) {
  const reduced = useReducedMotion() === true;
  const { data } = useStatePoll();
  const tx = data?.last_settlement_tx ?? KNOWN_TXS.firstSettlement;
  const progress = useMotionValue(1);
  const [reached, setReached] = useState(4);
  const [settled, setSettled] = useState(true);
  const [run, setRun] = useState(0);
  const coinX = useTransform(progress, (v) => `${v * 100}%`);
  const coinOpacity = useTransform(progress, [0, 0.04, 0.97, 1], [0, 1, 1, 0]);
  const elapsed = useTransform(
    progress,
    (v) => `${Math.round(v * MEASURED.settleMs)} ms`,
  );

  useMotionValueEvent(progress, "change", (v) => {
    const next = v >= 0.995 ? 4 : Math.min(3, Math.floor(v * 3 + 0.04)) + 1;
    setReached((r) => (r === next ? r : next));
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: "run" restarts the loop when Replay is pressed
  useEffect(() => {
    if (!active || reduced) {
      progress.set(1);
      setReached(4);
      setSettled(true);
      return;
    }
    let cancelled = false;
    let controls: { stop: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      while (!cancelled) {
        setSettled(false);
        progress.set(0);
        setReached(1);
        const c = animate(progress, 1, {
          duration: TRAVEL_S,
          ease: [0.65, 0, 0.35, 1],
        });
        controls = c;
        await c;
        if (cancelled) {
          break;
        }
        setSettled(true);
        await new Promise<void>((resolve) => {
          timer = setTimeout(resolve, HOLD_MS);
        });
      }
    };
    void loop();
    return () => {
      cancelled = true;
      controls?.stop();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [active, reduced, progress, run]);

  return (
    <div className="space-y-6">
      <div
        className="relative pt-8"
        role="img"
        aria-label="The agent's signed payment goes through the facilitator, which pays the gas, moves $0.01 of USDC and lands in the Mavera contract."
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-[54px] right-[12.5%] left-[12.5%] h-px"
        >
          <div className="absolute inset-0 border-t border-dashed border-white/15" />
          <motion.div
            className="absolute -top-px left-0 h-[2px] w-full origin-left rounded-full bg-gradient-to-r from-honey/30 via-honey/80 to-honey shadow-[0_0_14px_rgba(245,181,43,0.55)]"
            style={{ scaleX: progress }}
          />
          <motion.div className="absolute inset-0" style={{ x: coinX }}>
            <motion.span
              className="absolute top-1/2 left-0 block size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff1c7,#f5b52b_55%,#c98a0b)] shadow-[0_0_18px_5px_rgba(245,181,43,0.5)]"
              style={{ opacity: coinOpacity }}
            />
          </motion.div>
        </div>
        <ol className="relative grid grid-cols-4">
          {SETTLE_NODES.map((n, i) => {
            const on = reached > i;
            return (
              <li
                key={n.key}
                className="flex flex-col items-center text-center"
              >
                <div className="relative grid size-11 place-items-center">
                  <AnimatePresence>
                    {on ? (
                      <motion.span
                        key="ring"
                        aria-hidden="true"
                        className="absolute -inset-1.5 rounded-full ring-2 ring-honey/90 shadow-[0_0_24px_rgba(245,181,43,0.45)]"
                        initial={reduced ? false : { opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.15 }}
                        transition={SPRING_SNAPPY}
                      />
                    ) : null}
                  </AnimatePresence>
                  <motion.div
                    animate={{ scale: on ? 1.06 : 1, opacity: on ? 1 : 0.55 }}
                    transition={SPRING_SNAPPY}
                  >
                    <SettleGlyph k={n.key} />
                  </motion.div>
                  {n.key === "mavera" ? (
                    <AnimatePresence>
                      {settled ? (
                        <motion.span
                          key={`chip-${run}`}
                          className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-honey px-2 py-0.5 text-[11px] font-semibold text-[#1a1206] shadow-[0_6px_20px_-6px_rgba(245,181,43,0.7)]"
                          initial={
                            reduced ? false : { opacity: 0, y: 8, scale: 0.85 }
                          }
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={SPRING_BOUNCY_LOCAL}
                        >
                          +$0.01
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  ) : null}
                </div>
                <p
                  className={cn(
                    "mt-3 text-sm transition-colors duration-300",
                    on ? "text-cream" : "text-muted-foreground",
                  )}
                >
                  {n.label}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-xs",
                    n.key === "facilitator"
                      ? "text-sky"
                      : "text-muted-foreground",
                  )}
                >
                  {n.note}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="hairline border-t" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <motion.span className="tabular min-w-[4.5ch] font-mono text-cream">
            {elapsed}
          </motion.span>
          <span>
            {settled
              ? "settled end to end in our pre-flight."
              : "verify, transfer, settle…"}
          </span>
          {!reduced ? (
            <button
              type="button"
              onClick={() => setRun((r) => r + 1)}
              className="ml-1 rounded-full px-2 py-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-cream hover:underline focus-visible:text-cream"
            >
              Replay
            </button>
          ) : null}
        </p>
        <TxLink hash={tx} />
      </div>
    </div>
  );
}

const SPRING_BOUNCY_LOCAL = {
  type: "spring",
  stiffness: 420,
  damping: 22,
} as const;

/* ---------- 4. Split: live cap table, coin fragments ---------- */
function SplitDevice({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const { rows, totalSupply, others, isLoading } = useHolders();
  const parts = useMemo(() => {
    const list = rows
      .filter((r) => r.shares > BigInt(0))
      .map((r) => ({
        key: r.key,
        label: r.isYou ? "You" : r.label,
        who: r.who,
        bps: r.bps,
        claimable: r.claimable as bigint | null,
        part:
          totalSupply > BigInt(0)
            ? (PRICE_UNITS * r.shares) / totalSupply
            : BigInt(0),
      }));
    if (others > BigInt(0) && totalSupply > BigInt(0)) {
      list.push({
        key: "others",
        label: "Others",
        who: "other",
        bps: Number((others * BigInt(10000)) / totalSupply),
        claimable: null,
        part: (PRICE_UNITS * others) / totalSupply,
      });
    }
    return list;
  }, [rows, totalSupply, others]);

  return (
    <div className="space-y-4">
      <div className="relative flex h-12 items-center justify-center">
        <AnimatePresence>
          {active && !reduced ? (
            <motion.span
              key="coin"
              aria-hidden="true"
              initial={{ y: -30, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: [0, 1, 1, 0], scale: [0.8, 1, 1, 0.4] }}
              transition={{
                duration: 1.1,
                ease: EASE_OUT,
                times: [0, 0.3, 0.7, 1],
              }}
              className="relative size-8 rounded-full bg-honey shadow-[inset_-3px_-3px_0_rgba(0,0,0,0.18)]"
            >
              <span className="absolute left-1.5 top-1.5 size-2 rounded-full bg-cream/80" />
            </motion.span>
          ) : null}
        </AnimatePresence>
        <span className="tabular absolute right-0 text-sm text-muted-foreground">
          $0.01 per call
        </span>
      </div>
      {isLoading && parts.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Reading balances from Monad testnet.
        </p>
      ) : null}
      <ul className="divide-y divide-white/[0.07]">
        {parts.map((p, i) => (
          <li key={p.key} className="relative flex items-center gap-3 py-3">
            <HolderAvatar who={p.who} size={36} />
            <span className="min-w-0 flex-1 truncate text-sm text-cream">
              {p.label}
            </span>
            <AnimatePresence>
              {active && !reduced ? (
                <motion.span
                  key={`frag-${p.key}`}
                  initial={{ y: -40 - i * 20, opacity: 0, scale: 0.6 }}
                  animate={{ y: 0, opacity: [0, 1, 1, 0.9], scale: 1 }}
                  transition={{
                    delay: 0.9 + i * 0.12,
                    duration: 0.7,
                    ease: EASE_OUT,
                  }}
                  className="tabular rounded-md px-1.5 font-mono text-[12px] text-honey"
                >
                  +${formatUsdcFrac(p.part)}
                </motion.span>
              ) : (
                <span className="tabular font-mono text-[12px] text-honey">
                  +${formatUsdcFrac(p.part)}
                </span>
              )}
            </AnimatePresence>
            <NumberTicker
              value={`${(p.bps / 100).toFixed(2)}%`}
              className="tabular w-16 text-right text-sm text-muted-foreground"
            />
            <span className="hidden w-32 text-right sm:block">
              {p.claimable !== null ? (
                <NumberTicker
                  value={formatUsdc(p.claimable, "exact").replace(" USDC", "")}
                  className="tabular text-sm text-cream"
                />
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="hairline" />
      <Caption>
        Each part is $0.01 times the holder's live share balance.
        <span className="hidden sm:inline">
          {" "}
          The last column is what they can claim now.
        </span>
      </Caption>
    </div>
  );
}

function formatUsdcFrac(atomic: bigint): string {
  const s = atomic.toString().padStart(7, "0");
  const whole = s.slice(0, -6);
  const frac = s.slice(-6).replace(/0+$/, "").padEnd(2, "0");
  return `${Number(whole)}.${frac}`;
}

/* ---------- 5. Claim ---------- */
function ClaimDevice() {
  const { address } = useConnection();
  const { rows, isLoading } = useHolders();
  const mine = rows.find((r) => r.isYou);
  const creator = rows.find((r) => r.who === "bear") ?? rows[0];
  const row = isLoading ? undefined : address && mine ? mine : creator;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {row ? (
          <HolderAvatar who={row.isYou ? "you" : row.who} size={44} />
        ) : null}
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {address && mine
              ? "Your claimable"
              : `${row?.label ?? "Creator"} can claim`}
          </p>
          {row ? (
            <span className="flex items-baseline gap-2">
              <NumberTicker
                value={`$${formatUsdcAmount(row.claimable, "exact")}`}
                className="display tabular text-3xl text-honey sm:text-4xl"
              />
              <span className="text-sm text-muted-foreground">USDC</span>
            </span>
          ) : (
            <span className="block h-9 w-40 animate-pulse rounded-md bg-white/[0.06]" />
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {address ? (
          <PillLink href="#try" variant="primary">
            Claim it
          </PillLink>
        ) : (
          <Caption>Connect a wallet to see yours.</Caption>
        )}
      </div>
      <div className="hairline" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Caption>A real claim on Monad testnet.</Caption>
        <TxLink hash={KNOWN_TXS.claim} />
      </div>
    </div>
  );
}

export function StepDevice({
  step,
  active,
  challenge,
}: {
  step: StepKey;
  active: boolean;
  challenge: Challenge;
}) {
  switch (step) {
    case "ask":
      return <AskDevice c={challenge} />;
    case "sign":
      return <SignDevice active={active} c={challenge} />;
    case "settle":
      return <SettleDevice active={active} />;
    case "split":
      return <SplitDevice active={active} />;
    case "claim":
      return <ClaimDevice />;
  }
}

/** Cross-fading container for the sticky device. */
export function DeviceStage({
  step,
  challenge,
}: {
  step: StepKey;
  challenge: Challenge;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      layout={!reduced}
      transition={SPRING_SNAPPY}
      className="relative"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={step}
          layout={!reduced}
          initial={reduced ? false : { opacity: 0, y: 12, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={
            reduced
              ? { opacity: 0, transition: { duration: 0 } }
              : { opacity: 0, y: -12, filter: "blur(4px)" }
          }
          transition={{ duration: DUR.base, ease: EASE_OUT }}
        >
          <StepDevice step={step} active challenge={challenge} />
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
