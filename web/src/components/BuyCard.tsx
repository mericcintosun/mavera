"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { erc20Abi } from "@/lib/abi/erc20";
import { maveraAbi } from "@/lib/abi/mavera";
import { getClientEnv } from "@/lib/env";
import {
  ceilCost,
  formatShares,
  formatUsdcAmount,
  isUserRejected,
  parseShares,
  toBig,
  ZERO,
} from "@/lib/format";
import { TxLine } from "./TxLine";
import { Button, Card } from "./ui";
import { STATE_QUERY_KEY, useStatePoll } from "./useStatePoll";
import { useWalletGate } from "./wallet";

type Step =
  | { kind: "idle" }
  | { kind: "approving"; hash?: Hex }
  | { kind: "buying"; hash?: Hex }
  | { kind: "done"; hash: Hex; block: number; fee: bigint; shares: bigint }
  | { kind: "error"; message: string; hash?: Hex };

export function BuyCard() {
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
      void queryClient.invalidateQueries({ queryKey: [STATE_QUERY_KEY] });
    } catch (error) {
      setStep({
        kind: "error",
        message: isUserRejected(error)
          ? "Rejected in wallet."
          : "Transaction failed.",
        hash: currentHash,
      });
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

  return (
    <Card
      title="Buy shares"
      subtitle="You pay the creator; the fountain pays you from then on. Revenue from before your purchase stays with earlier holders."
    >
      <label htmlFor="shares" className="block text-sm font-medium">
        Shares
      </label>
      <input
        id="shares"
        inputMode="decimal"
        autoComplete="off"
        placeholder="5"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        disabled={busy}
        className="tabular mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      <p className="tabular mt-1 text-xs text-muted">
        {state?.deployed
          ? `Remaining: ${formatShares(remaining)} shares · Cost: ${formatUsdcAmount(cost)} USDC`
          : "Remaining: — · Cost: —"}
      </p>

      <Button
        className="mt-4 w-full"
        onClick={gate.action ?? run}
        disabled={gate.action ? gate.disabled : !canSubmit}
      >
        {label}
      </Button>
      {gate.helper ? (
        <p className="mt-2 text-xs text-muted">{gate.helper}</p>
      ) : null}
      {reason ? <p className="mt-2 text-sm text-muted">{reason}</p> : null}

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
          finalizedBlock={state?.finalized_block}
        />
      ) : null}
      {step.kind === "error" ? (
        <TxLine text={step.message} hash={step.hash} tone="error" />
      ) : null}
    </Card>
  );
}
