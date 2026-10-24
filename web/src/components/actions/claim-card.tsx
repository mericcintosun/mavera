"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { Address, Hex } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { NumberTicker } from "@/components/primitives/number-ticker";
import { Pill } from "@/components/primitives/pill";
import { STATE_QUERY_KEY, useStatePoll } from "@/components/useStatePoll";
import { useWalletGate } from "@/components/wallet";
import { maveraAbi } from "@/lib/abi/mavera";
import { getClientEnv } from "@/lib/env";
import {
  formatUsdc,
  formatUsdcAmount,
  isUserRejected,
  toBig,
  ZERO,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { CoinBurst, FormSkeleton } from "./parts";
import { TxLine } from "./tx-line";

type Step =
  | { kind: "idle" }
  | { kind: "claiming"; hash?: Hex }
  | { kind: "done"; hash: Hex; block: number; fee: bigint; amount: bigint }
  | { kind: "error"; message: string; hash?: Hex };

export function ClaimForm() {
  const { data: state } = useStatePoll();
  const queryClient = useQueryClient();
  const gate = useWalletGate();
  const publicClient = usePublicClient();
  const write = useWriteContract();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [burst, setBurst] = useState(0);
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
      setBurst((b) => b + 1);
      toast.success(`Claimed ${formatUsdc(amount, "exact")}`);
      void queryClient.invalidateQueries({ queryKey: [STATE_QUERY_KEY] });
    } catch (error) {
      const message = isUserRejected(error)
        ? "Rejected in wallet."
        : "Transaction failed.";
      setStep({ kind: "error", message, hash });
      toast.error(message);
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

  if (state === undefined) {
    return <FormSkeleton />;
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">Claimable now</p>
      <div
        className={cn(
          "display mt-3 flex items-baseline gap-2 text-4xl sm:text-6xl",
          hasWallet
            ? claimable > ZERO
              ? "text-mint"
              : "text-cream"
            : "text-cream/40",
        )}
      >
        <NumberTicker value={`$${formatUsdcAmount(claimable, "exact")}`} />
        <span className="font-sans text-sm text-muted-foreground">USDC</span>
      </div>
      <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
        {hasWallet
          ? "Your share of every paid call so far. It stays in the contract until you claim."
          : "Connect a wallet to see your share of every paid call so far."}
      </p>

      <div className="relative mt-8">
        <Pill
          size="lg"
          className="w-full"
          loading={busy}
          onClick={gate.action ?? run}
          disabled={
            gate.action
              ? gate.disabled
              : !gate.ready || claimable === ZERO || busy || !publicClient
          }
        >
          {label}
        </Pill>
        <CoinBurst burstKey={burst} />
      </div>
      {gate.helper ? (
        <p className="mt-3 text-sm text-muted-foreground">{gate.helper}</p>
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
          finalizedBlock={state.finalized_block}
        />
      ) : null}
      {step.kind === "error" ? (
        <TxLine text={step.message} hash={step.hash} tone="error" />
      ) : null}
    </div>
  );
}
