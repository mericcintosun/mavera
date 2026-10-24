"use client";

import { LogOut } from "lucide-react";
import { useConnection, useDisconnect } from "wagmi";
import { pillVariants } from "@/components/primitives/pill";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWalletGate } from "@/components/wallet";
import { shortHex } from "@/lib/format";
import { cn } from "@/lib/utils";

const PILL = cn(
  pillVariants({ variant: "secondary", size: "md" }),
  "active:scale-[0.97] motion-reduce:transform-none",
);

/** Connect / switch-chain / connected pill shared by the nav (quiet, secondary). */
export function WalletButton({ className }: { className?: string }) {
  const gate = useWalletGate();
  const { address } = useConnection();
  const disconnect = useDisconnect();

  if (gate.ready && address) {
    return (
      <TooltipProvider>
        <div className={cn("flex items-center gap-1", className)}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so keyboard users get the full-address tooltip
                tabIndex={0}
                className={cn(
                  PILL,
                  "cursor-default px-4 font-mono text-[13px] tabular-nums active:scale-100",
                )}
              >
                <span aria-hidden className="size-1.5 rounded-full bg-mint" />
                {shortHex(address)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="font-mono text-xs">
              {address}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => disconnect.mutate()}
                aria-label="Disconnect wallet"
                disabled={disconnect.isPending}
                className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-white/8 hover:text-cream focus-visible:ring-2 focus-visible:ring-honey focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1324] active:bg-white/12 disabled:opacity-45"
              >
                <LogOut aria-hidden className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Disconnect wallet</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  const button = (
    <button
      type="button"
      className={cn(PILL, "whitespace-nowrap")}
      onClick={gate.action ?? undefined}
      disabled={gate.disabled || gate.action === null}
    >
      <span className="hidden sm:inline">{gate.label}</span>
      <span className="sm:hidden">
        {gate.label === "Connect wallet" ? "Connect" : gate.label}
      </span>
    </button>
  );

  if (!gate.helper) {
    return <div className={className}>{button}</div>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("inline-flex", className)}>{button}</div>
        </TooltipTrigger>
        <TooltipContent>{gate.helper}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
