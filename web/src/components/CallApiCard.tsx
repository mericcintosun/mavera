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
import { useState } from "react";
import type { SignTypedDataParameters } from "viem";
import { useWalletClient } from "wagmi";
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
import { Button, Card, ExternalLink } from "./ui";
import { useStatePoll } from "./useStatePoll";
import { useWalletGate } from "./wallet";

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
}

const BUTTON_LABEL: Record<Exclude<Phase, "idle">, string> = {
  requesting: "Requesting… (expecting 402)",
  checking: "Checking who gets paid…",
  signing: "Sign the payment in your wallet",
  paying: "Paying… (verify, serve, settle)",
  settled: "Call again",
  failed: "Try again",
};

function toFixedDecimals(value: string, decimals: number): string {
  const [whole, frac = ""] = value.split(".");
  return `${whole}.${frac.padEnd(decimals, "0").slice(0, decimals)}`;
}

function summarize(payload: PricePayload): string {
  const block = `block ${formatInt(payload.block_number)} (final ${formatInt(payload.finalized_block)})`;
  if (payload.mode === "heartbeat") {
    return [
      "Monad heartbeat",
      block,
      payload.epoch === null ? null : `epoch ${formatInt(payload.epoch)}`,
      payload.proposer_val_id === null
        ? null
        : `proposer #${payload.proposer_val_id}`,
      payload.validator_count === null
        ? null
        : `${payload.validator_count} validators`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const sources = payload.sources.map((source) => {
    const age = source.age_s === null ? "unavailable" : `${source.age_s} s`;
    return `${source.name} ${age}${source.valid ? "" : " (stale)"}`;
  });
  return [
    payload.price_usd === null
      ? "MON/USD unavailable"
      : `MON/USD $${toFixedDecimals(payload.price_usd, 5)}`,
    ...sources,
    payload.spread_bps === null ? null : `spread ${payload.spread_bps} bps`,
    block,
  ]
    .filter(Boolean)
    .join(" · ");
}

function isPricePayload(value: unknown): value is PricePayload {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { pair?: unknown }).pair === "MON/USD"
  );
}

export function CallApiCard() {
  const { data: state } = useStatePoll();
  const gate = useWalletGate();
  const { data: walletClient } = useWalletClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Settled | null>(null);
  const [error, setError] = useState<string | null>(null);
  const env = getClientEnv();
  const priceAtomic = toBig(state?.price_atomic ?? "10000");
  const priceText = `${formatUsdcAmount(priceAtomic)} USDC`;

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
      setPhase("failed");
      setError(
        `Refused: the contract's payTo() is ${state.pay_to}, not NEXT_PUBLIC_MAVERA_ADDRESS. Nothing was signed.`,
      );
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
      setPhase("checking");
      const verdict = checkRequirement(selectedRequirements, lock);
      if (!verdict.ok) {
        return { abort: true as const, reason: verdict.reason };
      }
      progress.phase = "signing";
      setPhase("signing");
    });
    client.onAfterPaymentCreation(async () => {
      progress.phase = "paying";
      setPhase("paying");
    });
    const httpClient = new x402HTTPClient(client);
    const fetchWithPayment = wrapFetchWithPayment(
      globalThis.fetch.bind(globalThis),
      client,
    );

    setPhase("requesting");
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
        setResult({
          payload: isPricePayload(body) ? body : null,
          raw: body,
          transaction: settle?.transaction ?? null,
          payer: settle?.payer ?? null,
          note: settle
            ? null
            : "The server answered without a settlement header (no payment was made).",
        });
        setPhase("settled");
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
              note: "Payment broadcast, confirmation pending (settlement_pending).",
            });
            setPhase("settled");
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
      setPhase("failed");
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

  return (
    <Card
      title="Call the API"
      subtitle={`GET /api/price: MON/USD from two oracles on Monad testnet, read in one call. Price ${priceText}. You sign a USDC authorization; the facilitator pays the gas.`}
    >
      <Button
        className="w-full"
        onClick={gate.action ?? run}
        disabled={
          gate.action
            ? gate.disabled
            : !gate.ready || busy || !walletClient || state?.deployed !== true
        }
      >
        {label}
      </Button>
      {gate.helper ? (
        <p className="mt-2 text-xs text-muted">{gate.helper}</p>
      ) : null}
      {state && !state.deployed ? (
        <p className="mt-2 text-sm text-muted">Mavera is not deployed yet.</p>
      ) : null}

      <div aria-live="polite" className="mt-4 space-y-2 text-sm">
        {result?.payload ? (
          <p className="tabular font-medium">{summarize(result.payload)}</p>
        ) : null}
        {result?.note ? <p className="text-muted">{result.note}</p> : null}
        {result?.transaction ? (
          <>
            <p className="tabular">
              Payment settled on Monad: {shortHex(result.transaction)} —{" "}
              <ExternalLink href={explorerTx(result.transaction)}>
                View transaction
              </ExternalLink>
            </p>
            <p className="tabular text-muted">
              Payer: you ({shortHex(result.payer ?? gate.address ?? "")}) →
              Mavera contract
            </p>
          </>
        ) : null}
        {result ? (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">Response JSON</summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-paper p-3">
              {JSON.stringify(result.raw, null, 2)}
            </pre>
          </details>
        ) : null}
        {error ? (
          <p className="text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </div>

      <p className="mt-4 text-xs text-muted">
        Prefer the terminal?{" "}
        <code className="rounded bg-paper px-1.5 py-0.5">
          pnpm --filter @mavera/scripts customer
        </code>
      </p>
    </Card>
  );
}
