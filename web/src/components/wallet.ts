"use client";

import type { Address } from "viem";
import {
  useConnect,
  useConnection,
  useConnectors,
  useSwitchChain,
} from "wagmi";
import { monadChain } from "@/lib/chain";

export interface WalletGate {
  address: Address | undefined;
  /** Connected on chain 10143: writes may proceed. */
  ready: boolean;
  /** Button label that replaces the action label while not ready (null when ready). */
  label: string | null;
  action: (() => void) | null;
  disabled: boolean;
  helper: string | null;
}

function isProviderNotFound(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { name?: string }).name === "ProviderNotFoundError"
  );
}

/** Shared connect -> switch-chain gate for every card (wagmi 3 hooks). */
export function useWalletGate(): WalletGate {
  const { address, chainId, status } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const switchChain = useSwitchChain();

  // Prefer an EIP-6963 discovered wallet over the generic window.ethereum connector.
  const connector =
    connectors.find((c) => c.id !== "injected") ?? connectors[0];

  if (status === "connected") {
    if (chainId !== monadChain.id) {
      return {
        address,
        ready: false,
        label: switchChain.isPending ? "Switching…" : "Switch to Monad Testnet",
        action: () => switchChain.mutate({ chainId: monadChain.id }),
        disabled: switchChain.isPending,
        helper: switchChain.error ? "Switch rejected in wallet." : null,
      };
    }
    return {
      address,
      ready: true,
      label: null,
      action: null,
      disabled: false,
      helper: null,
    };
  }

  if (connector === undefined || isProviderNotFound(connect.error)) {
    return {
      address: undefined,
      ready: false,
      label: "No browser wallet found",
      action: null,
      disabled: true,
      helper:
        "Install MetaMask, or use the terminal script in the Call-the-API card.",
    };
  }

  const connecting =
    status === "connecting" || status === "reconnecting" || connect.isPending;
  return {
    address: undefined,
    ready: false,
    label: connecting ? "Connecting…" : "Connect wallet",
    action: () => connect.mutate({ connector }),
    disabled: connecting,
    helper: null,
  };
}
