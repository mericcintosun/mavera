"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { maveraAbi } from "@/lib/abi/mavera";
import { getClientEnv } from "@/lib/env";
import { formatUsdc, isUserRejected, toBig, ZERO } from "@/lib/format";
import { TxLine } from "./TxLine";
import { Button, Card } from "./ui";
import { STATE_QUERY_KEY, useStatePoll } from "./useStatePoll";
import { useWalletGate } from "./wallet";

type Step =
  | { kind: "idle" }
  | { kind: "claiming"; hash?: Hex }
  | { kind: "done"; hash: Hex; block: number; fee: bigint; amount: bigint }
  | { kind: "error"; message: string; hash?: Hex };

export function ClaimCard() {
  const { data: state } = useStatePoll();
  const queryClient = useQueryClient();
  const gate = useWalletGate();
  const publicClient = usePublicClient();
  const write = useWriteContract();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const env = getClientEnv();

  const claimable = toBig(state?.me?.claimable);
  const hasWallet = state?.me !== null && state?.me !== undefined;
  const busy = step.kind === "claiming";

  async function run() {
    if (!publicClient) {
      return;
    }
    let hash: Hex | undefined;
    const amount = claimable;
    try {
      setStep({ kind: "claiming" });
      hash = await write.mutateAsync({
        abi: maveraAbi,
        address: env.NEXT_PUBLIC_MAVERA_ADDRESS as Address,
        functionName: "claim",
      });
      setStep({ kind: "claiming", hash });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        pollingInterval: 500,
      });
      if (receipt.status !== "success") {
        throw new Error("claim reverted");
      }
      setStep({
        kind: "done",
        hash,
        block: Number(receipt.blockNumber),
        fee: receipt.gasUsed * receipt.effectiveGasPrice,
        amount,
      });
      void queryClient.invalidateQueries({ queryKey: [STATE_QUERY_KEY] });
    } catch (error) {
      setStep({
        kind: "error",
        message: isUserRejected(error)
          ? "Rejected in wallet."
          : "Transaction failed.",
        hash,
      });
    }
  }

  let label: string;
  if (gate.label) {
    label = gate.label;
  } else if (busy) {
    label = "Claiming…";
  } else if (claimable === ZERO) {
    label = "Nothing to claim yet";
  } else {
    label = `Claim ${formatUsdc(claimable, "exact")}`;
  }

  return (
    <Card
      title="Claim"
      subtitle="Your share of every paid call so far. Unclaimed USDC stays in the contract until you claim."
    >
      <p className="tabular text-sm text-muted">
        Claimable now:{" "}
        <span className="font-semibold text-ink">
          {hasWallet
            ? formatUsdc(claimable, "exact")
            : "connect a wallet to see"}
        </span>
      </p>
      <Button
        className="mt-4 w-full"
        onClick={gate.action ?? run}
        disabled={
          gate.action
            ? gate.disabled
            : !gate.ready || claimable === ZERO || busy || !publicClient
        }
      >
        {label}
      </Button>
      {gate.helper ? (
        <p className="mt-2 text-xs text-muted">{gate.helper}</p>
      ) : null}

      {step.kind === "claiming" ? (
        <TxLine text="Claiming" hash={step.hash} />
      ) : null}
      {step.kind === "done" ? (
        <TxLine
          text={`Claimed ${formatUsdc(step.amount, "exact")}`}
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
