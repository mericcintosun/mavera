"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { SPRING_BOUNCY } from "@/components/motion/tokens";
import { HolderAvatar } from "@/components/primitives/holder-avatar";
import type { HolderRow } from "@/hooks/use-holders";
import { formatUsdc, formatUsdcAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

const W = 400;
const H = 240;
const JAR_X = W / 2;
const MOUTH_Y = 58;
const CUP_TOP = 178;
const CUP_W = 46;
const CUP_H = 50;
const COINS = 6;
const FALL_S = 0.95;
const ZERO = BigInt(0);

interface Coin {
  id: string;
  cup: number;
  delay: number;
  xs: number[];
  ys: number[];
}

function cupX(i: number, n: number) {
  const span = Math.min(W - 80, n * 92);
  const start = (W - span) / 2;
  return n === 1 ? W / 2 : start + (span / (n - 1)) * i;
}

/** Split `total` coins across cups by bps with largest remainder. */
function allocate(bps: number[], total: number): number[] {
  const sum = bps.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    return bps.map((_, i) => (i === 0 ? total : 0));
  }
  const raw = bps.map((b) => (b / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, f: r - Math.floor(r) }))
    .sort((a, b) => b.f - a.f);
  for (const { i } of order) {
    if (left <= 0) {
      break;
    }
    out[i] += 1;
    left -= 1;
  }
  return out;
}

/** Sample a quadratic curve from the jar mouth to a cup. */
function curve(toX: number, jitter: number) {
  const p0 = { x: JAR_X + jitter, y: MOUTH_Y };
  const p2 = { x: toX + jitter * 0.6, y: CUP_TOP + 14 };
  const p1 = { x: (p0.x + p2.x) / 2 + jitter * 2, y: MOUTH_Y + 20 };
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    const e = t * t; // gravity: slow start, fast landing
    const u = 1 - e;
    xs.push(u * u * p0.x + 2 * u * e * p1.x + e * e * p2.x);
    ys.push(u * u * p0.y + 2 * u * e * p1.y + e * e * p2.y);
  }
  return { xs, ys };
}

/**
 * The payout scene: the jar, one cup per holder (fill = claimable relative to
 * the largest), and six coins per revenue event that land in the cups in
 * proportion to each holder's share. Static under reduced motion.
 */
export function HoneyStream({
  latestId,
  latestAmount = null,
  holders,
  projector = false,
  className,
}: {
  latestId: number | null;
  latestAmount?: bigint | null;
  holders: HolderRow[];
  projector?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const [coins, setCoins] = useState<Coin[]>([]);
  const [lit, setLit] = useState<Set<number>>(new Set());
  const [chip, setChip] = useState<number | null>(null);

  const cups = holders.length > 0 ? holders : [];
  const n = Math.max(1, cups.length);
  const bpsKey = cups.map((h) => h.bps).join(",");
  let maxClaimable = ZERO;
  for (const h of cups) {
    if (h.claimable > maxClaimable) {
      maxClaimable = h.claimable;
    }
  }

  useEffect(() => {
    if (latestId === null || reduced) {
      return;
    }
    const bps = bpsKey ? bpsKey.split(",").map(Number) : [10000];
    const count = Math.max(1, bps.length);
    const split = allocate(bps, COINS);
    const burst: Coin[] = [];
    let k = 0;
    split.forEach((c, cup) => {
      for (let j = 0; j < c; j++) {
        const jitter = (Math.random() - 0.5) * 10;
        burst.push({
          id: `${latestId}-${k}`,
          cup,
          delay: k * 0.08,
          ...curve(cupX(cup, count), jitter),
        });
        k++;
      }
    });
    setCoins((list) => [...list, ...burst]);
    setChip(latestId);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const coin of burst) {
      timers.push(
        setTimeout(
          () => setLit((s) => new Set(s).add(coin.cup)),
          (FALL_S + coin.delay) * 1000,
        ),
      );
    }
    timers.push(
      setTimeout(() => setLit(new Set()), (FALL_S + COINS * 0.08) * 1000 + 900),
    );
    timers.push(
      setTimeout(
        () =>
          setCoins((list) =>
            list.filter((c) => !c.id.startsWith(`${latestId}-`)),
          ),
        (FALL_S + COINS * 0.08 + 0.3) * 1000,
      ),
    );
    timers.push(setTimeout(() => setChip(null), 1400));
    return () => {
      for (const t of timers) {
        clearTimeout(t);
      }
    };
  }, [latestId, reduced, bpsKey]);

  return (
    <div className={cn("relative mx-auto w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label={`Honey jar paying ${n} holder${n === 1 ? "" : "s"}`}
      >
        <defs>
          <linearGradient id="hs-honey" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd36b" />
            <stop offset="0.55" stopColor="#f5b52b" />
            <stop offset="1" stopColor="#e39a12" />
          </linearGradient>
          <radialGradient id="hs-coin" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#fff1c7" />
            <stop offset="0.45" stopColor="#f5b52b" />
            <stop offset="1" stopColor="#c98207" />
          </radialGradient>
        </defs>

        {/* Jar */}
        <rect
          x={JAR_X - 30}
          y={4}
          width={60}
          height={8}
          rx={4}
          fill="#fff7e6"
          opacity={0.9}
        />
        <path
          d={`M${JAR_X - 26} 14 h52 v26 q0 18 -18 18 h-16 q-18 0 -18 -18 z`}
          fill="url(#hs-honey)"
        />
        <rect
          x={JAR_X - 18}
          y={20}
          width={4}
          height={22}
          rx={2}
          fill="#fff7e6"
          opacity={0.45}
        />

        {/* Faint guide lines from the jar to each cup */}
        {cups.map((h, i) => {
          const x = cupX(i, n);
          return (
            <path
              key={`g-${h.key}`}
              d={`M${JAR_X} ${MOUTH_Y} Q${(JAR_X + x) / 2} ${MOUTH_Y + 20} ${x} ${CUP_TOP + 10}`}
              fill="none"
              stroke="rgba(245,181,43,0.16)"
              strokeWidth={1}
              strokeDasharray="2 5"
            />
          );
        })}

        {/* Cups */}
        {cups.map((h, i) => {
          const x = cupX(i, n);
          const level =
            maxClaimable > ZERO
              ? Number((h.claimable * BigInt(1000)) / maxClaimable) / 1000
              : 0;
          const on = lit.has(i);
          return (
            <motion.g
              key={h.key}
              animate={on && !reduced ? { y: [0, 4, 0] } : { y: 0 }}
              transition={
                on
                  ? { duration: 0.45, ease: [0.22, 1, 0.36, 1] }
                  : { duration: 0.2 }
              }
            >
              <clipPath id={`hs-cup-${h.key}`}>
                <path
                  d={`M${x - CUP_W / 2} ${CUP_TOP} h${CUP_W} l-4 ${CUP_H - 8} q0 8 -8 8 h-${CUP_W - 24} q-8 0 -8 -8 z`}
                />
              </clipPath>
              <path
                d={`M${x - CUP_W / 2} ${CUP_TOP} h${CUP_W} l-4 ${CUP_H - 8} q0 8 -8 8 h-${CUP_W - 24} q-8 0 -8 -8 z`}
                fill="rgba(255,255,255,0.05)"
                stroke={on ? "rgba(47,182,124,0.9)" : "rgba(255,255,255,0.14)"}
                strokeWidth={1.25}
                style={{
                  transition: "stroke 400ms",
                  filter: on
                    ? "drop-shadow(0 0 10px rgba(47,182,124,0.7))"
                    : "none",
                }}
              />
              <g clipPath={`url(#hs-cup-${h.key})`}>
                <motion.rect
                  x={x - CUP_W / 2}
                  y={CUP_TOP}
                  width={CUP_W}
                  height={CUP_H}
                  fill="url(#hs-honey)"
                  style={{ originY: 1, transformBox: "fill-box" }}
                  initial={false}
                  animate={{ scaleY: Math.max(0.06, level * 0.92) }}
                  transition={reduced ? { duration: 0 } : SPRING_BOUNCY}
                />
              </g>
            </motion.g>
          );
        })}

        {/* Coins */}
        <AnimatePresence>
          {coins.map((coin) => (
            <motion.circle
              key={coin.id}
              r={projector ? 6 : 5.5}
              fill="url(#hs-coin)"
              initial={{ cx: coin.xs[0], cy: coin.ys[0], opacity: 0 }}
              animate={{
                cx: coin.xs,
                cy: coin.ys,
                opacity: [0, 1, 1, 1, 1, 1, 1, 1, 0],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: FALL_S,
                delay: coin.delay,
                ease: "linear",
              }}
            />
          ))}
        </AnimatePresence>
      </svg>

      {/* +$0.01 chip rising from the jar */}
      <AnimatePresence>
        {chip !== null && !reduced ? (
          <motion.span
            key={chip}
            aria-hidden="true"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: -14 }}
            exit={{ opacity: 0, y: -28 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="tabular pointer-events-none absolute left-[61%] top-[2%] text-sm font-medium text-honey"
          >
            +${formatUsdcAmount(latestAmount ?? BigInt(10000))}
          </motion.span>
        ) : null}
      </AnimatePresence>

      {/* Holder labels, aligned with the cups */}
      <div className="relative mt-2 h-16">
        {cups.map((h, i) => (
          <div
            key={h.key}
            className="absolute top-0 flex w-24 -translate-x-1/2 flex-col items-center gap-1 text-center"
            style={{ left: `${(cupX(i, n) / W) * 100}%` }}
          >
            <HolderAvatar who={h.who} size={projector ? 32 : 28} />
            <span className="tabular whitespace-nowrap text-xs text-muted-foreground">
              {h.isYou ? "You" : h.label}
              {h.bps > 0 ? ` · ${(h.bps / 100).toFixed(1)}%` : ""}
            </span>
            <span className="sr-only">
              claimable {formatUsdc(h.claimable, "exact")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
