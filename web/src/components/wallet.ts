"use client";

import type { Address } from "viem";
import { useConnect, useConnection, useSwitchChain } from "wagmi";
import {
  useDetectedWallets,
  useWalletPicker,
} from "@/components/wallet/wallet-picker";
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

/**
 * Shared connect -> switch-chain gate for every action button (wagmi 3 hooks).
 * With several browser wallets installed the connect action opens the picker
 * so the user chooses the extension (MetaMask, Rabby, Brave...) instead of
 * being routed to whichever one owns window.ethereum.
 */
export function useWalletGate(): WalletGate {
  const { address, chainId, status } = useConnection();
  const wallets = useDetectedWallets();
  const connect = useConnect();
  const switchChain = useSwitchChain();
  const picker = useWalletPicker();

  if (status === "connected") {
    if (chainId !== monadChain.id) {
      return {
        address,
        ready: false,
        label: switchChain.isPending ? "Switching…" : "Switch to Monad Testnet",
        action: () => {
          if (switchChain.isPending) {
            return;
          }
          switchChain.mutate({ chainId: monadChain.id });
        },
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

  const onlyWallet = wallets.length === 1 ? wallets[0] : undefined;
  if (
    wallets.length === 0 ||
    (onlyWallet?.id === "injected" && isProviderNotFound(connect.error))
  ) {
    return {
      address: undefined,
      ready: false,
      label: "No browser wallet found",
      action: () => picker.open(),
      disabled: false,
      helper:
        "Install MetaMask or Rabby, or use the terminal command under Try it.",
    };
  }

  const connecting =
    status === "connecting" || status === "reconnecting" || connect.isPending;
  return {
    address: undefined,
    ready: false,
    label: connecting ? "Connecting…" : "Connect wallet",
    action: () => {
      if (connecting) {
        return;
      }
      if (onlyWallet) {
        connect.mutate({ connector: onlyWallet });
        return;
      }
      picker.open();
    },
    disabled: connecting,
    helper: null,
  };
}
