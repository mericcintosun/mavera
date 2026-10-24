"use client";

import { Check } from "lucide-react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DUR, EASE_OUT, SPRING_SNAPPY } from "@/components/motion/tokens";
import { DevicePanel } from "@/components/primitives/device-panel";
import {
  HolderAvatar,
  type HolderWho,
} from "@/components/primitives/holder-avatar";
import { NumberTicker } from "@/components/primitives/number-ticker";
import { Pill } from "@/components/primitives/pill";
import {
  buy,
  claim,
  claimable,
  createLedger,
  type Ledger,
  pay,
  sync,
  totals,
  transfer,
} from "@/lib/accounting";
import { formatShares, formatUsdcAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

const E18 = BigInt("10") ** BigInt("18");
const PRICE = BigInt("10000"); // $0.01 in USDC units
const ZERO = BigInt("0");
const AUTO_MS = 900;

type Id = "bear" | "fox" | "rabbit";
const CAST: { id: Id; name: string; who: HolderWho; role: string }[] = [
  { id: "bear", name: "Bear", who: "bear", role: "Creator" },
  { id: "fox", name: "Fox", who: "fox", role: "Holder" },
  { id: "rabbit", name: "Rabbit", who: "rabbit", role: "Holder" },
];
const NAME: Record<Id, string> = { bear: "Bear", fox: "Fox", rabbit: "Rabbit" };

function initialLedger(): Ledger {
  let l = createLedger({
    creatorShares: BigInt("60") * E18,
    sharePrice: PRICE,
    maxSupply: BigInt("100") * E18,
    creator: "bear",
  });
  l = buy(l, "fox", BigInt("20") * E18);
  l = buy(l, "rabbit", BigInt("20") * E18);
  return l;
}

interface Entry {
  id: number;
  text: string;
}
interface Split {
  id: number;
  amounts: Record<Id, bigint>;
}

const usd = (v: bigint) => `$${formatUsdcAmount(v, "exact")}`;

export function Simulator() {
  const reduced = useReducedMotion() === true;
  const [ledger, setLedger] = useState<Ledger>(initialLedger);
  const [log, setLog] = useState<Entry[]>([]);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [split, setSplit] = useState<Split | null>(null);
  const [claimFx, setClaimFx] = useState<{ id: number; who: Id } | null>(null);
  const [auto, setAuto] = useState(false);
  const [dragging, setDragging] = useState<Id | null>(null);
  const [hover, setHover] = useState<Id | null>(null);
  const [formFrom, setFormFrom] = useState<Id>("fox");
  const dragged = useRef(false);
  const seq = useRef(0);
  const ledgerRef = useRef(ledger);
  ledgerRef.current = ledger;

  const push = useCallback((text: string) => {
    seq.current += 1;
    const id = seq.current;
    setLog((l) => [{ id, text }, ...l].slice(0, 8));
    return id;
  }, []);

  const doPay = useCallback(() => {
    const before = ledgerRef.current;
    const after = sync(pay(before, PRICE));
    const amounts = {} as Record<Id, bigint>;
    for (const c of CAST)
      amounts[c.id] = claimable(after, c.id) - claimable(before, c.id);
    ledgerRef.current = after;
    setLedger(after);
    const parts = CAST.filter((c) => amounts[c.id] > ZERO)
      .map((c) => `${c.name} +${usd(amounts[c.id])}`)
      .join(", ");
    const id = push(`Robot paid $0.01. sync() split it: ${parts}.`);
    setSplit({ id, amounts });
  }, [push]);

  // Auto-pay: every 900 ms while on and the tab is visible.
  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(() => {
      if (!document.hidden) doPay();
    }, AUTO_MS);
    return () => window.clearInterval(t);
  }, [auto, doPay]);

  useEffect(() => {
    if (!split) return;
    const t = window.setTimeout(() => setSplit(null), 600);
    return () => window.clearTimeout(t);
  }, [split]);

  const doClaim = (who: Id) => {
    try {
      const r = claim(ledgerRef.current, who);
      ledgerRef.current = r.state;
      setLedger(r.state);
      const id = push(`${NAME[who]} claimed ${usd(r.amount)}.`);
      setClaimFx({ id, who });
    } catch {
      /* NothingToClaim: the button is disabled at zero */
    }
  };

  const doTransfer = (from: Id, to: Id, shares: bigint) => {
    if (from === to || shares <= ZERO) return;
    try {
      const next = transfer(ledgerRef.current, from, to, shares);
      ledgerRef.current = next;
      setLedger(next);
      const n = formatShares(shares);
      push(`${NAME[from]} sent ${n} shares to ${NAME[to]}.`);
      setNote({
        text: `${NAME[from]} sent ${n} shares to ${NAME[to]}. Their past revenue stayed with ${NAME[from]}.`,
        ok: true,
      });
    } catch {
      setNote({
        text: `${NAME[from]} holds ${formatShares(ledgerRef.current.balances[from] ?? ZERO)} shares, so it cannot send ${formatShares(shares)}.`,
        ok: false,
      });
    }
  };

  const reset = () => {
    setAuto(false);
    const l = initialLedger();
    ledgerRef.current = l;
    setLedger(l);
    setLog([]);
    setNote(null);
    setSplit(null);
  };

  const t = totals(ledger);
  const sumClaimable = CAST.reduce(
    (a, c) => a + claimable(ledger, c.id, { includePending: false }),
    ZERO,
  );
  const sumClaimed = CAST.reduce(
    (a, c) => a + (ledger.claimed[c.id] ?? ZERO),
    ZERO,
  );
  const holds =
    t.dust >= ZERO && sumClaimable + sumClaimed + t.dust === t.totalDistributed;
  const calls = Number(t.totalDistributed / PRICE);

  const dropTarget = (x: number, y: number, from: Id): Id | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      const id = (el as HTMLElement).dataset?.drop as Id | undefined;
      if (id && id !== from) return id;
    }
    return null;
  };

  return (
    <DevicePanel glow="none" className="p-4 sm:p-8">
      {/* Jar and robot */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <HolderAvatar who="robot" size={52} />
            <AnimatePresence>
              {split && !reduced ? (
                <motion.span
                  key={split.id}
                  aria-hidden="true"
                  className="absolute top-1/2 left-1/2 size-4 rounded-full bg-honey shadow-[0_0_0_3px_rgba(245,181,43,0.2)]"
                  initial={{ x: "-50%", y: "-50%", opacity: 1, scale: 1 }}
                  animate={{ y: 60, opacity: 0, scale: 0.6 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.55, ease: EASE_OUT }}
                />
              ) : null}
            </AnimatePresence>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Paid into the contract
            </p>
            <NumberTicker
              value={`$${formatUsdcAmount(t.totalDistributed, "auto")}`}
              className="display text-3xl text-cream sm:text-4xl"
            />
            <p className="text-sm text-muted-foreground tabular-nums">
              {calls.toLocaleString("en-US")} {calls === 1 ? "call" : "calls"}{" "}
              at $0.01
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Pill variant="primary" size="lg" onClick={doPay}>
            Pay $0.01
          </Pill>
          <button
            type="button"
            aria-pressed={auto}
            onClick={() => setAuto((a) => !a)}
            className="group inline-flex min-h-11 items-center gap-3 rounded-full px-3 text-sm text-cream outline-none transition-colors hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-honey active:bg-white/10"
          >
            <span
              aria-hidden="true"
              className={cn(
                "relative flex h-6 w-10 items-center rounded-full p-0.5 transition-colors",
                auto ? "bg-mint" : "bg-white/15",
              )}
            >
              <motion.span
                className="size-5 rounded-full bg-cream"
                animate={{ x: auto ? 16 : 0 }}
                transition={reduced ? { duration: 0 } : SPRING_SNAPPY}
              />
            </span>
            Auto-pay
          </button>
        </div>
      </div>

      {/* Holders */}
      <div className="mt-8 grid border-y border-white/[0.08] sm:-mx-5 sm:grid-cols-3">
        {CAST.map((c) => {
          const shares = ledger.balances[c.id] ?? ZERO;
          const bps =
            t.totalSupply > ZERO
              ? Number((shares * BigInt("10000")) / t.totalSupply)
              : 0;
          const cl = claimable(ledger, c.id);
          const claimed = ledger.claimed[c.id] ?? ZERO;
          const frag = split?.amounts[c.id];
          const canSend = shares >= BigInt("5") * E18;
          const isTarget = dragging !== null && dragging !== c.id;
          return (
            <div
              key={c.id}
              data-drop={c.id}
              className={cn(
                "relative -mx-3 px-3 py-5 ring-inset transition-colors not-first:border-t not-first:border-white/[0.08] sm:px-5 sm:mx-0 sm:not-first:border-t-0 sm:not-first:border-l",
                hover === c.id && isTarget
                  ? "rounded-xl bg-mint/[0.06] ring-2 ring-mint"
                  : isTarget
                    ? "rounded-xl bg-white/[0.03] ring-1 ring-white/15"
                    : "",
              )}
            >
              <div className="pointer-events-none flex items-center gap-3">
                <HolderAvatar who={c.who} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-cream">{c.name}</p>
                  <p className="text-sm text-muted-foreground">{c.role}</p>
                </div>
                <div className="text-right">
                  <NumberTicker
                    value={formatShares(shares)}
                    className="text-lg font-medium text-cream"
                  />
                  <p className="text-sm text-muted-foreground">
                    {(bps / 100).toFixed(0)}% of supply
                  </p>
                </div>
              </div>
              <div className="pointer-events-none mt-3 h-1.5 overflow-hidden rounded-full bg-white/8">
                <motion.div
                  className="h-full origin-left rounded-full bg-cream/70"
                  initial={false}
                  animate={{ scaleX: bps / 10000 }}
                  transition={reduced ? { duration: 0 } : SPRING_SNAPPY}
                />
              </div>

              <div className="relative mt-4">
                <p className="text-sm text-muted-foreground">Claimable</p>
                <NumberTicker
                  value={usd(cl)}
                  className="display text-2xl text-honey sm:text-[28px]"
                />
                <AnimatePresence>
                  {frag !== undefined && split ? (
                    <motion.span
                      key={split.id}
                      aria-hidden="true"
                      className="absolute top-0 right-0 font-mono text-sm text-honey tabular-nums"
                      initial={
                        reduced ? false : { opacity: 0, y: -28, scale: 0.8 }
                      }
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.35, ease: EASE_OUT }}
                    >
                      +{formatUsdcAmount(frag, "exact")}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                <div className="relative">
                  <p className="text-sm text-muted-foreground">Wallet</p>
                  <NumberTicker
                    value={usd(claimed)}
                    className="font-mono text-sm text-cream"
                  />
                  <AnimatePresence>
                    {claimFx?.who === c.id && !reduced ? (
                      <motion.span
                        key={claimFx.id}
                        aria-hidden="true"
                        className="absolute -top-8 left-2 size-3 rounded-full bg-honey"
                        initial={{ opacity: 1, y: 0 }}
                        animate={{ opacity: 0, y: 34 }}
                        transition={{ duration: 0.6, ease: EASE_OUT }}
                        onAnimationComplete={() => setClaimFx(null)}
                      />
                    ) : null}
                  </AnimatePresence>
                </div>
                <Pill
                  variant="secondary"
                  disabled={cl === ZERO}
                  onClick={() => doClaim(c.id)}
                  aria-label={`Claim ${usd(cl)} for ${c.name}`}
                >
                  Claim
                </Pill>
              </div>

              <motion.button
                type="button"
                drag={canSend}
                dragSnapToOrigin
                dragMomentum={false}
                whileDrag={{ scale: 1.08, zIndex: 20 }}
                disabled={!canSend}
                onDragStart={() => {
                  dragged.current = true;
                  setDragging(c.id);
                }}
                onClick={() => {
                  if (dragged.current) {
                    dragged.current = false;
                    return;
                  }
                  setFormFrom(c.id);
                  document.getElementById("pg-n")?.focus();
                }}
                onDrag={(e) => {
                  const p = e as PointerEvent;
                  setHover(dropTarget(p.clientX, p.clientY, c.id));
                }}
                onDragEnd={(e) => {
                  const p = e as PointerEvent;
                  const to = dropTarget(p.clientX, p.clientY, c.id);
                  setDragging(null);
                  setHover(null);
                  if (to) doTransfer(c.id, to, BigInt("5") * E18);
                }}
                aria-label={`${c.name}: drag 5 shares onto another holder, or press to send from ${c.name} with the form below`}
                className="relative mt-3 inline-flex min-h-11 cursor-grab touch-none select-none items-center gap-2 rounded-full bg-white/6 px-4 text-sm text-cream ring-1 ring-white/10 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-honey active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span
                  aria-hidden="true"
                  className="grid grid-cols-2 gap-0.5 opacity-50"
                >
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="size-1 rounded-full bg-cream" />
                  ))}
                </span>
                5 shares
              </motion.button>
            </div>
          );
        })}
      </div>

      <TransferForm onSend={doTransfer} from={formFrom} setFrom={setFormFrom} />

      <AnimatePresence mode="wait">
        {note ? (
          <motion.p
            key={note.text}
            role="status"
            className={cn(
              "mt-3 text-sm",
              note.ok ? "text-mint" : "text-red-300",
            )}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.fast }}
          >
            {note.text}
          </motion.p>
        ) : null}
      </AnimatePresence>

      {/* Ledger strip */}
      <dl className="mt-8 grid grid-cols-2 border-t border-white/[0.08] sm:grid-cols-4">
        {[
          ["accPerShare", t.accPerShare.toString()],
          ["accounted", usd(t.accounted)],
          ["totalDistributed", usd(t.totalDistributed)],
          ["dust (units)", t.dust.toString()],
        ].map(([k, v]) => (
          <div
            key={k}
            className="min-w-0 border-b border-white/[0.06] py-3 pr-3 sm:border-b-0"
          >
            <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
            <dd className="mt-1 truncate font-mono text-sm text-sky">
              <NumberTicker value={v} />
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm text-cream">
          <motion.span
            key={`${t.totalDistributed}-${sumClaimed}`}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-full",
              holds ? "bg-mint/15 text-mint" : "bg-red-500/15 text-red-400",
            )}
            initial={reduced ? false : { scale: 1.35 }}
            animate={{ scale: 1 }}
            transition={SPRING_SNAPPY}
          >
            <Check className="size-3.5" aria-hidden="true" />
          </motion.span>
          <span>
            claimable + claimed + dust = total distributed
            <span className="mt-1 block font-mono text-xs text-cream/70 tabular-nums sm:mt-0 sm:ml-2 sm:inline">
              {usd(sumClaimable)} + {usd(sumClaimed)} + {t.dust.toString()} ={" "}
              {usd(t.totalDistributed)}
            </span>
          </span>
          <span className="sr-only">{holds ? "Holds" : "Broken"}</span>
        </p>
        <div className="flex items-center gap-2">
          <Pill variant="ghost" onClick={reset}>
            Reset
          </Pill>
          <a
            href="https://github.com/mericcintosun/mavera/blob/main/docs/02-CONTRACT-SPEC.md"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-cream underline decoration-white/25 underline-offset-4 outline-none hover:decoration-cream focus-visible:ring-2 focus-visible:ring-honey"
          >
            Read the contract spec
          </a>
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-6 border-t border-white/[0.08] pt-4">
        <p className="text-sm text-muted-foreground">Last actions</p>
        {log.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Press Pay $0.01 to send the first call.
          </p>
        ) : (
          <LayoutGroup id="pg-timeline">
            <ol className="mt-2">
              <AnimatePresence initial={false}>
                {log.map((e) => (
                  <motion.li
                    key={e.id}
                    layout={!reduced}
                    initial={reduced ? false : { opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: DUR.fast, ease: EASE_OUT }}
                    className="border-b border-white/[0.05] py-2 text-sm text-cream/85 last:border-b-0"
                  >
                    {e.text}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          </LayoutGroup>
        )}
      </div>
    </DevicePanel>
  );
}

function TransferForm({
  onSend,
  from,
  setFrom,
}: {
  onSend: (from: Id, to: Id, shares: bigint) => void;
  from: Id;
  setFrom: (id: Id) => void;
}) {
  const [n, setN] = useState("5");
  const [to, setTo] = useState<Id>("rabbit");
  // Keep "to" different from "from" when the chip prefills the sender.
  useEffect(() => {
    if (to === from) setTo(CAST.find((c) => c.id !== from)?.id ?? "rabbit");
  }, [from, to]);
  const amount = useMemo(() => {
    const v = Number.parseInt(n, 10);
    return Number.isFinite(v) && v > 0 && v <= 100 ? BigInt(v) * E18 : null;
  }, [n]);
  const field =
    "h-11 rounded-full bg-white/6 px-3 text-sm text-cream ring-1 ring-white/10 outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-honey";
  return (
    <form
      className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      onSubmit={(e) => {
        e.preventDefault();
        if (amount) onSend(from, to, amount);
      }}
    >
      <label htmlFor="pg-n">Send</label>
      <input
        id="pg-n"
        inputMode="numeric"
        value={n}
        onChange={(e) => setN(e.target.value.replace(/\D/g, "").slice(0, 3))}
        className={cn(field, "w-16 text-center tabular-nums")}
      />
      <label htmlFor="pg-from">shares from</label>
      <select
        id="pg-from"
        value={from}
        onChange={(e) => setFrom(e.target.value as Id)}
        className={field}
      >
        {CAST.map((c) => (
          <option key={c.id} value={c.id} className="bg-[#0b1324]">
            {c.name}
          </option>
        ))}
      </select>
      <label htmlFor="pg-to">to</label>
      <select
        id="pg-to"
        value={to}
        onChange={(e) => setTo(e.target.value as Id)}
        className={field}
      >
        {CAST.map((c) => (
          <option key={c.id} value={c.id} className="bg-[#0b1324]">
            {c.name}
          </option>
        ))}
      </select>
      <Pill type="submit" variant="secondary" disabled={!amount || from === to}>
        Send
      </Pill>
    </form>
  );
}
