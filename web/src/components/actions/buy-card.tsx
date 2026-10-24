"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { Address, Hex } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { NumberTicker } from "@/components/primitives/number-ticker";
import { Pill } from "@/components/primitives/pill";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { STATE_QUERY_KEY, useStatePoll } from "@/components/useStatePoll";
import { useWalletGate } from "@/components/wallet";
import { erc20Abi } from "@/lib/abi/erc20";
import { maveraAbi } from "@/lib/abi/mavera";
import { getClientEnv } from "@/lib/env";
import {
  ceilCost,
  formatShares,
  formatUsdc,
  formatUsdcAmount,
  isUserRejected,
  parseShares,
  SHARE_SCALE,
  toBig,
  ZERO,
} from "@/lib/format";
import { FormSkeleton } from "./parts";
import { TxLine } from "./tx-line";

type Step =
  | { kind: "idle" }
  | { kind: "approving"; hash?: Hex }
  | { kind: "buying"; hash?: Hex }
  | { kind: "done"; hash: Hex; block: number; fee: bigint; shares: bigint }
  | { kind: "error"; message: string; hash?: Hex };

const QUICK_PICKS = ["1", "5", "20"];

export function BuyForm() {
  const poll = useStatePoll();
  const state = poll.data;
  const queryClient = useQueryClient();
  const gate = useWalletGate();
  const publicClient = usePublicClient();
  const write = useWriteContract();
  const [input, setInput] = useState("");
  const [step, setStep] = useState<Step>({ kind: "idle" });

  const env = getClientEnv();
  const mavera = env.NEXT_PUBLIC_MAVERA_ADDRESS as Address;
  const usdc = env.NEXT_PUBLIC_USDC_ADDRESS as Address;

  const sharePrice = toBig(state?.share_price);
  const total = toBig(state?.total_supply);
  const max = toBig(state?.max_supply);
  const remaining = max > total ? max - total : ZERO;
  const shares = parseShares(input);
  const cost = shares === null ? ZERO : ceilCost(shares, sharePrice);
  const me = state?.me ?? null;
  const balance = toBig(me?.usdc_balance);
  const allowance = toBig(me?.usdc_allowance);
  const needsApprove = me !== null && allowance < cost;
  const busy = step.kind === "approving" || step.kind === "buying";
  const remainingWhole = Number(remaining / SHARE_SCALE);
  const sliderMax = Math.max(1, remainingWhole);
  const wholeShares = shares === null ? 0 : Number(shares / SHARE_SCALE);
  const priceAtomic = toBig(state?.price_atomic ?? "10000");
  const after = shares === null ? ZERO : total + shares;
  const pctTenths =
    shares === null || after === ZERO ? ZERO : (shares * BigInt(10000)) / after;
  const pctText = `${pctTenths / BigInt(100)}.${(pctTenths % BigInt(100)).toString().padStart(2, "0")}`;
  const perCall =
    shares === null || after === ZERO ? ZERO : (priceAtomic * shares) / after;

  let reason: string | null = null;
  if (state && !state.deployed) {
    reason = "Mavera is not deployed yet.";
  } else if (state && remaining === ZERO) {
    reason = "All shares sold.";
  } else if (shares === null) {
    reason = input.trim() === "" ? null : "Enter a number of shares.";
  } else if (state && shares > remaining) {
    reason = `Only ${formatShares(remaining)} shares remain.`;
  } else if (state && cost === ZERO) {
    reason = "Enter a number of shares.";
  } else if (gate.ready && me && balance < cost) {
    reason = `Not enough USDC: you have ${formatUsdcAmount(balance)} USDC. Get 20 test USDC at faucet.circle.com (Monad Testnet).`;
  }

  async function run() {
    if (!publicClient || shares === null) {
      return;
    }
    let currentHash: Hex | undefined;
    try {
      if (allowance < cost) {
        setStep({ kind: "approving" });
        currentHash = await write.mutateAsync({
          abi: erc20Abi,
          address: usdc,
          functionName: "approve",
          args: [mavera, cost],
        });
        setStep({ kind: "approving", hash: currentHash });
        const approval = await publicClient.waitForTransactionReceipt({
          hash: currentHash,
          pollingInterval: 500,
        });
        if (approval.status !== "success") {
          throw new Error("approve reverted");
        }
      }
      setStep({ kind: "buying" });
      currentHash = await write.mutateAsync({
        abi: maveraAbi,
        address: mavera,
        functionName: "buy",
        args: [shares],
      });
      setStep({ kind: "buying", hash: currentHash });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: currentHash,
        pollingInterval: 500,
      });
      if (receipt.status !== "success") {
        throw new Error("buy reverted");
      }
      setStep({
        kind: "done",
        hash: currentHash,
        block: Number(receipt.blockNumber),
        fee: receipt.gasUsed * receipt.effectiveGasPrice,
        shares,
      });
      setInput("");
      toast.success(`Bought ${formatShares(shares)} shares`);
      void queryClient.invalidateQueries({ queryKey: [STATE_QUERY_KEY] });
    } catch (error) {
      const message = isUserRejected(error)
        ? "Rejected in wallet."
        : "Transaction failed.";
      setStep({ kind: "error", message, hash: currentHash });
      toast.error(message);
    }
  }

  let label: string;
  if (gate.label) {
    label = gate.label;
  } else if (step.kind === "approving") {
    label = "Approving…";
  } else if (step.kind === "buying") {
    label = "Buying…";
  } else if (shares === null) {
    label = "Buy shares";
  } else if (needsApprove) {
    label = `Approve ${formatUsdcAmount(cost)} USDC (1 of 2)`;
  } else {
    label = `Buy ${formatShares(shares)} shares`;
  }

  const canSubmit =
    gate.ready &&
    shares !== null &&
    reason === null &&
    !busy &&
    state?.deployed === true &&
    publicClient !== undefined;

  if (state === undefined) {
    return <FormSkeleton />;
  }

  return (
    <div>
      <h3 className="display text-2xl text-cream sm:text-3xl">Buy shares.</h3>
      <p className="mt-3 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
        You pay the creator once. Every paid call after that sends you your
        share.
      </p>

      <div className="mt-8 flex items-center gap-3">
        <label htmlFor="shares" className="sr-only">
          Shares
        </label>
        <div className="relative flex-1">
          <Input
            id="shares"
            inputMode="decimal"
            autoComplete="off"
            placeholder="5"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={busy}
            aria-invalid={shares === null && input.trim() !== ""}
            className="tabular h-14 rounded-2xl border-0 bg-white/6 px-5 pr-20 text-lg text-cream ring-1 ring-white/8 placeholder:text-cream/30 focus-visible:border-0 focus-visible:ring-1 focus-visible:ring-honey/60 md:text-lg dark:bg-white/6"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-sm text-muted-foreground"
          >
            shares
          </span>
        </div>
        <fieldset className="flex gap-1.5">
          <legend className="sr-only">Quick picks</legend>
          {QUICK_PICKS.map((pick) => (
            <Pill
              key={pick}
              variant={input === pick ? "primary" : "secondary"}
              disabled={busy}
              onClick={() => setInput(pick)}
              aria-pressed={input === pick}
              className="tabular w-11 px-0 sm:w-12"
            >
              {pick}
            </Pill>
          ))}
        </fieldset>
      </div>

      <div className="mt-6 py-2">
        <Slider
          aria-label="Shares to buy"
          className="h-11 [&_[data-slot=slider-range]]:h-full [&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-track]]:w-full"
          min={1}
          max={sliderMax}
          step={1}
          value={[Math.min(Math.max(wholeShares, 1), sliderMax)]}
          onValueChange={(v) => setInput(String(v[0] ?? 1))}
          disabled={busy || remainingWhole < 1}
        />
        <div className="tabular mt-2 flex justify-between text-xs text-muted-foreground">
          <span>1</span>
          <span>{formatShares(remaining)} left</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[1fr_auto] items-end gap-4 border-t hairline pt-6">
        <div>
          <p className="text-sm text-muted-foreground">You pay</p>
          <div className="display mt-1 text-4xl text-honey sm:text-5xl">
            <NumberTicker
              value={state.deployed ? `$${formatUsdcAmount(cost)}` : "$0.00"}
            />
          </div>
        </div>
        <p className="pb-1 text-right text-sm text-muted-foreground">USDC</p>
      </div>
      <p
        aria-live="polite"
        className="tabular mt-3 text-pretty text-sm leading-relaxed text-muted-foreground"
      >
        {shares === null || !state.deployed ? (
          "Pick an amount to preview your ownership."
        ) : (
          <>
            You would own <span className="text-cream">{pctText}%</span> of
            supply and receive{" "}
            <span className="text-cream">{formatUsdc(perCall, "exact")}</span>{" "}
            of every ${formatUsdcAmount(priceAtomic)} call.
          </>
        )}
      </p>

      <Pill
        size="lg"
        className="mt-6 w-full"
        loading={busy}
        onClick={gate.action ?? run}
        disabled={gate.action ? gate.disabled : !canSubmit}
      >
        {label}
      </Pill>
      {gate.helper ? (
        <p className="mt-3 text-sm text-muted-foreground">{gate.helper}</p>
      ) : null}
      {reason ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {reason}
        </p>
      ) : null}

      {step.kind === "approving" || step.kind === "buying" ? (
        <TxLine
          text={
            step.kind === "approving"
              ? "Approving USDC (1 of 2)"
              : "Buying (2 of 2)"
          }
          hash={step.hash}
        />
      ) : null}
      {step.kind === "done" ? (
        <TxLine
          text={`Bought ${formatShares(step.shares)} shares`}
          hash={step.hash}
          block={step.block}
          fee={step.fee}
          finalizedBlock={state.finalized_block}
        />
      ) : null}
      {step.kind === "error" ? (
        <TxLine text={step.message} hash={step.hash} tone="error" />
      ) : null}
    </div>
  );
}
