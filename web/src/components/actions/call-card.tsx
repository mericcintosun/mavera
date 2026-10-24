"use client";

import type { SettleResponse } from "@x402/core/types";
import { type ClientEvmSigner, ExactEvmScheme } from "@x402/evm";
import {
  decodePaymentResponseHeader,
  type Network,
  wrapFetchWithPayment,
  x402Client,
  x402HTTPClient,
} from "@x402/fetch";
import { Check, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { SignTypedDataParameters } from "viem";
import { useWalletClient } from "wagmi";
import { SPRING_SNAPPY } from "@/components/motion/tokens";
import { NumberTicker } from "@/components/primitives/number-ticker";
import { Pill } from "@/components/primitives/pill";
import { TxLink } from "@/components/primitives/tx-link";
import { useStatePoll } from "@/components/useStatePoll";
import { useWalletGate } from "@/components/wallet";
import { usePaymentChallenge } from "@/hooks/use-402-challenge";
import { CAIP2_NETWORK, explorerTx } from "@/lib/chain";
import { getClientEnv } from "@/lib/env";
import {
  errorMessage,
  formatInt,
  formatUsdcAmount,
  isUserRejected,
  shortHex,
  toBig,
} from "@/lib/format";
import {
  checkRequirement,
  LOCK_REFUSAL_PREFIX,
  type RouteLock,
  selectAllowedRequirement,
} from "@/lib/lock";
import type { PricePayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CoinBurst, FormSkeleton } from "./parts";

type Phase =
  | "idle"
  | "requesting"
  | "checking"
  | "signing"
  | "paying"
  | "settled"
  | "failed";

interface Settled {
  payload: PricePayload | null;
  raw: unknown;
  transaction: string | null;
  payer: string | null;
  note: string | null;
  elapsedMs: number | null;
}

const BUTTON_LABEL: Record<Exclude<Phase, "idle">, string> = {
  requesting: "Request…",
  checking: "Checking who gets paid…",
  signing: "Sign the payment in your wallet",
  paying: "Paying…",
  settled: "Call again",
  failed: "Try again",
};

const STEPS: { key: Exclude<Phase, "idle" | "failed">; label: string }[] = [
  { key: "requesting", label: "Request" },
  { key: "checking", label: "Check payee" },
  { key: "signing", label: "Sign" },
  { key: "paying", label: "Settle" },
  { key: "settled", label: "Done" },
];

function toFixedDecimals(value: string, decimals: number): string {
  const [whole, frac = ""] = value.split(".");
  return `${whole}.${frac.padEnd(decimals, "0").slice(0, decimals)}`;
}

function isPricePayload(value: unknown): value is PricePayload {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { pair?: unknown }).pair === "MON/USD"
  );
}

/** Index of the furthest step reached; -1 when idle. */
function stepIndex(phase: Phase, lastActive: Phase): number {
  const p = phase === "failed" ? lastActive : phase;
  return STEPS.findIndex((s) => s.key === p);
}

/** Five segments that fill with a spring as the x402 handshake advances. */
function ProgressRail({
  phase,
  lastActive,
}: {
  phase: Phase;
  lastActive: Phase;
}) {
  const reduced = useReducedMotion();
  const idx = stepIndex(phase, lastActive);
  const failed = phase === "failed";
  const settled = phase === "settled";
  return (
    <ol aria-label="Payment progress" className="grid grid-cols-5 gap-1.5">
      {STEPS.map((step, i) => {
        const reached = i <= idx;
        const current = i === idx && !settled;
        return (
          <li
            key={step.key}
            aria-current={current ? "step" : undefined}
            className="min-w-0"
          >
            <span className="block h-1 overflow-hidden rounded-full bg-white/10">
              <motion.span
                className={cn(
                  "block h-full origin-left rounded-full",
                  current && failed
                    ? "bg-destructive"
                    : settled
                      ? "bg-mint"
                      : "bg-honey",
                )}
                initial={false}
                animate={{ scaleX: reached ? 1 : 0 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { ...SPRING_SNAPPY, delay: reached ? 0.04 * i : 0 }
                }
              />
            </span>
            <span
              className={cn(
                "mt-2 block text-xs leading-tight",
                current && failed
                  ? "text-destructive"
                  : reached
                    ? "text-cream"
                    : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Decoded 402 challenge, checked before the wallet is asked to sign. */
function PayeeCheck({ expected }: { expected: string }) {
  const { run, status, accept } = usePaymentChallenge();
  const ran = useRef(false);
  useEffect(() => {
    if (!ran.current) {
      ran.current = true;
      void run();
    }
  }, [run]);
  const matches =
    accept !== null && accept.payTo.toLowerCase() === expected.toLowerCase();
  const amount =
    accept !== null ? `$${formatUsdcAmount(toBig(accept.amount))} USDC` : null;
  return (
    <dl
      aria-live="polite"
      aria-busy={status === "loading"}
      className="divide-y divide-white/[0.06] rounded-2xl bg-white/[0.03] px-4 text-sm ring-1 ring-white/[0.06]"
    >
      <div className="flex items-center justify-between gap-4 py-3">
        <dt className="text-muted-foreground">Amount</dt>
        <dd className="tabular text-cream">{amount ?? "Reading the 402…"}</dd>
      </div>
      <div className="flex items-center justify-between gap-4 py-3">
        <dt className="text-muted-foreground">Payee</dt>
        <dd className="flex min-w-0 items-center gap-2 text-right">
          {status === "error" ? (
            <span className="text-muted-foreground">
              Challenge unavailable. The route lock still checks it.
            </span>
          ) : accept === null ? (
            <span className="text-muted-foreground">Checking…</span>
          ) : matches ? (
            <>
              <span className="font-mono text-[12.5px] text-sky">
                {shortHex(accept.payTo)}
              </span>
              <span className="hidden text-muted-foreground sm:inline">
                matches the Mavera contract
              </span>
              <Check aria-hidden="true" className="size-4 shrink-0 text-mint" />
              <span className="sr-only sm:hidden">
                matches the Mavera contract
              </span>
            </>
          ) : (
            <>
              <span className="text-destructive">
                {shortHex(accept.payTo)} is not the Mavera contract. Signing
                will be refused.
              </span>
              <X
                aria-hidden="true"
                className="size-4 shrink-0 text-destructive"
              />
            </>
          )}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-4 py-3">
        <dt className="text-muted-foreground">Network</dt>
        <dd className="text-cream">Monad testnet</dd>
      </div>
    </dl>
  );
}

function Receipt({
  result,
  fallbackPayer,
}: {
  result: Settled;
  fallbackPayer: string;
}) {
  const p = result.payload;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mt-6 rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/[0.06]"
    >
      {p ? (
        p.mode === "heartbeat" ? (
          <div>
            <p className="text-sm text-muted-foreground">Monad heartbeat</p>
            <p className="tabular mt-1 text-base text-cream">
              block {formatInt(p.block_number)} · final{" "}
              {formatInt(p.finalized_block)}
              {p.epoch === null ? "" : ` · epoch ${formatInt(p.epoch)}`}
              {p.proposer_val_id === null
                ? ""
                : ` · proposer #${p.proposer_val_id}`}
              {p.validator_count === null
                ? ""
                : ` · ${p.validator_count} validators`}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground">MON/USD</p>
            {p.price_usd === null ? (
              <p className="display mt-1 text-4xl text-cream">unavailable</p>
            ) : (
              <NumberTicker
                value={`$${toFixedDecimals(p.price_usd, 5)}`}
                className="display mt-1 text-5xl text-cream"
              />
            )}
            <p className="tabular mt-3 text-sm leading-relaxed text-muted-foreground">
              {p.sources
                .map(
                  (s) =>
                    `${s.name} ${s.age_s === null ? "unavailable" : `${s.age_s} s`}${s.valid ? "" : " (stale)"}`,
                )
                .join(" · ")}
              {p.spread_bps === null ? "" : ` · spread ${p.spread_bps} bps`}
            </p>
            <p className="tabular text-sm text-muted-foreground">
              block {formatInt(p.block_number)} · final{" "}
              {formatInt(p.finalized_block)}
            </p>
          </div>
        )
      ) : null}
      {result.note ? (
        <p className="mt-3 text-sm text-muted-foreground">{result.note}</p>
      ) : null}
      {result.transaction ? (
        <p className="tabular mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t hairline pt-4 text-sm text-muted-foreground">
          <span>Settled</span>
          <TxLink hash={result.transaction} />
          <span>
            payer{" "}
            <span className="font-mono text-[12.5px] text-cream">
              {shortHex(result.payer ?? fallbackPayer)}
            </span>
          </span>
          {result.elapsedMs !== null ? (
            <span className="text-mint">
              settled in {formatInt(result.elapsedMs)} ms
            </span>
          ) : null}
        </p>
      ) : null}
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-cream">
          Response JSON
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-white/5 p-3 font-mono text-[11px] leading-relaxed">
          {JSON.stringify(result.raw, null, 2)}
        </pre>
      </details>
    </motion.div>
  );
}

export function CallForm() {
  const { data: state } = useStatePoll();
  const gate = useWalletGate();
  const { data: walletClient } = useWalletClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [lastActive, setLastActive] = useState<Phase>("idle");
  const [result, setResult] = useState<Settled | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const env = getClientEnv();
  const priceAtomic = toBig(state?.price_atomic ?? "10000");
  const priceText = `$${formatUsdcAmount(priceAtomic)} USDC`;

  function go(next: Phase) {
    setPhase(next);
    if (next !== "failed" && next !== "idle") {
      setLastActive(next);
    }
  }

  async function run() {
    if (!walletClient || !gate.address) {
      return;
    }
    const address = gate.address;
    const lock: RouteLock = {
      payTo: env.NEXT_PUBLIC_MAVERA_ADDRESS,
      asset: env.NEXT_PUBLIC_USDC_ADDRESS,
      network: CAIP2_NETWORK,
      scheme: "exact",
      maxAmount: priceAtomic,
    };
    setError(null);
    setResult(null);

    // Cross-check with the contract's own payTo() view (served by /api/state).
    if (
      state?.pay_to &&
      state.pay_to.toLowerCase() !== lock.payTo.toLowerCase()
    ) {
      go("requesting");
      go("checking");
      go("failed");
      const msg = `Refused: the contract's payTo() is ${state.pay_to}, not NEXT_PUBLIC_MAVERA_ADDRESS. Nothing was signed.`;
      setError(msg);
      toast.error(msg);
      return;
    }

    const signer: ClientEvmSigner = {
      address,
      signTypedData: (message) =>
        walletClient.signTypedData({
          account: address,
          domain: message.domain,
          types: message.types,
          primaryType: message.primaryType,
          message: message.message,
        } as SignTypedDataParameters),
    };

    const progress: { phase: Phase } = { phase: "requesting" };
    const client = new x402Client(
      (_version, requirements) =>
        selectAllowedRequirement(requirements, lock) ?? requirements[0],
    );
    client.register(lock.network as Network, new ExactEvmScheme(signer));
    client.onBeforePaymentCreation(async ({ selectedRequirements }) => {
      progress.phase = "checking";
      go("checking");
      const verdict = checkRequirement(selectedRequirements, lock);
      if (!verdict.ok) {
        return { abort: true as const, reason: verdict.reason };
      }
      progress.phase = "signing";
      go("signing");
    });
    client.onAfterPaymentCreation(async () => {
      progress.phase = "paying";
      go("paying");
    });
    const httpClient = new x402HTTPClient(client);
    const fetchWithPayment = wrapFetchWithPayment(
      globalThis.fetch.bind(globalThis),
      client,
    );

    go("requesting");
    const startedAt = performance.now();
    try {
      const response = await fetchWithPayment("/api/price", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const body: unknown = await response.json().catch(() => null);
      const settleHeader = response.headers.get("PAYMENT-RESPONSE");
      let settle: SettleResponse | null = null;
      if (settleHeader) {
        try {
          settle = decodePaymentResponseHeader(settleHeader);
        } catch {
          settle = null;
        }
      }

      if (response.ok) {
        const tx = settle?.transaction ?? null;
        setResult({
          payload: isPricePayload(body) ? body : null,
          raw: body,
          transaction: tx,
          payer: settle?.payer ?? null,
          elapsedMs: tx ? Math.round(performance.now() - startedAt) : null,
          note: settle
            ? null
            : "The server answered without a settlement header (no payment was made).",
        });
        go("settled");
        if (tx) {
          setBurst((b) => b + 1);
          toast.success(
            `Paid $${formatUsdcAmount(priceAtomic)}, settled on Monad`,
            {
              description: shortHex(tx),
              action: {
                label: "View tx",
                onClick: () =>
                  window.open(explorerTx(tx), "_blank", "noopener"),
              },
            },
          );
        }
        return;
      }

      if (response.status === 402) {
        if (settle && !settle.success) {
          const reason = settle.errorReason ?? "unknown";
          if (reason === "settlement_pending" && settle.transaction) {
            setResult({
              payload: null,
              raw: body,
              transaction: settle.transaction,
              payer: settle.payer ?? null,
              elapsedMs: null,
              note: "Payment broadcast, confirmation pending (settlement_pending).",
            });
            go("settled");
            return;
          }
          throw new Error(`Settlement failed: ${reason}. Nothing was charged.`);
        }
        let declined = "unknown";
        try {
          const required = httpClient.getPaymentRequiredResponse(
            (name) => response.headers.get(name),
            body,
          ) as { error?: string };
          declined = required.error ?? declined;
        } catch {
          // keep "unknown"
        }
        const hint =
          declined === "insufficient_funds"
            ? " Your wallet needs test USDC: get 20 USDC at faucet.circle.com (Monad Testnet)."
            : "";
        throw new Error(`Payment declined: ${declined}.${hint}`);
      }

      if (response.status === 502) {
        throw new Error(
          "Facilitator unreachable (502). Try again in a few seconds.",
        );
      }
      const detail =
        body && typeof body === "object" && "message" in body
          ? String((body as { message: unknown }).message)
          : `HTTP ${response.status}`;
      throw new Error(`Call failed: ${detail}`);
    } catch (caught) {
      const message = errorMessage(caught);
      let shown = message;
      if (message.includes(LOCK_REFUSAL_PREFIX)) {
        const payTo = message
          .slice(
            message.indexOf(LOCK_REFUSAL_PREFIX) + LOCK_REFUSAL_PREFIX.length,
          )
          .split(/[\s"']/)[0];
        shown = `Refused: this server asked to be paid at ${payTo}, not the Mavera contract. Nothing was signed.`;
      } else if (progress.phase === "checking") {
        shown = `Refused: ${message}. Nothing was signed.`;
      } else if (isUserRejected(caught)) {
        shown = "Signature rejected in wallet.";
      } else if (message.includes("Payment already attempted")) {
        shown = "Already paid for this request; refusing to sign twice.";
      }
      setError(shown);
      go("failed");
      toast.error(shown);
    }
  }

  const busy =
    phase === "requesting" ||
    phase === "checking" ||
    phase === "signing" ||
    phase === "paying";
  let label: string;
  if (gate.label) {
    label = gate.label;
  } else if (phase === "idle") {
    label = `Pay ${priceText} and call`;
  } else {
    label = BUTTON_LABEL[phase];
  }

  if (state === undefined) {
    return <FormSkeleton />;
  }

  return (
    <div>
      <h3 className="display text-2xl text-cream sm:text-3xl">
        One call costs {priceText}.
      </h3>
      <p className="mt-3 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
        GET /api/price returns MON/USD from two oracles on Monad testnet. You
        sign a USDC authorization; the facilitator pays the gas.
      </p>

      <div className="mt-8">
        <PayeeCheck expected={env.NEXT_PUBLIC_MAVERA_ADDRESS} />
      </div>

      <div className="relative mt-6">
        <Pill
          size="lg"
          className="w-full"
          loading={busy}
          onClick={gate.action ?? run}
          disabled={
            gate.action
              ? gate.disabled
              : !gate.ready || busy || !walletClient || state.deployed !== true
          }
        >
          {label}
        </Pill>
        <CoinBurst burstKey={burst} />
      </div>
      {gate.helper ? (
        <p className="mt-3 text-sm text-muted-foreground">{gate.helper}</p>
      ) : null}
      {!state.deployed ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Mavera is not deployed yet.
        </p>
      ) : null}

      <div className="mt-6">
        <ProgressRail phase={phase} lastActive={lastActive} />
      </div>

      <div aria-live="polite">
        {result ? (
          <Receipt result={result} fallbackPayer={gate.address ?? ""} />
        ) : null}
        {error ? (
          <p className="mt-5 text-sm leading-relaxed text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
