// viem chain for Monad testnet. Starts from viem's `monadTestnet` (id 10143) and
// overrides the RPC URL and the explorer (Monadscan instead of monadexplorer),
// which is also what the wallet receives on `wallet_addEthereumChain`.
import { defineChain } from "viem";
import { monadTestnet } from "viem/chains";
import { getClientEnv } from "./env";

export const MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

export function buildMonadChain(rpcUrl: string, explorerUrl: string) {
  return defineChain({
    ...monadTestnet,
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "Monadscan", url: explorerUrl } },
    contracts: {
      multicall3: { address: MULTICALL3_ADDRESS, blockCreated: 251_449 },
    },
  });
}

const clientEnv = getClientEnv();

/** Chain object for the browser (wagmi) side. Server clients build their own from MONAD_RPC_URL. */
export const monadChain = buildMonadChain(
  clientEnv.NEXT_PUBLIC_MONAD_RPC_URL,
  clientEnv.NEXT_PUBLIC_EXPLORER_URL,
);

export const MONAD_CHAIN_ID = monadChain.id;
export const CAIP2_NETWORK = `eip155:${monadChain.id}` as const;
export const EXPLORER_URL = clientEnv.NEXT_PUBLIC_EXPLORER_URL;

export function explorerTx(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}

/** Facilitator signer that sends the USDC settlement transactions (pays the gas). */
export const FACILITATOR_SIGNER = "0x7f6a2850669202519f0FE8aa912451238820Db86";
