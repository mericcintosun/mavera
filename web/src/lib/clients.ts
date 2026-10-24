// Server-only viem clients. Never import from client components.
import {
  type Address,
  createPublicClient,
  createWalletClient,
  http,
} from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { buildMonadChain } from "./chain";
import { getServerEnv } from "./env";

function makeChain() {
  const env = getServerEnv();
  return buildMonadChain(
    env.MONAD_RPC_URL,
    process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet.monadscan.com",
  );
}

function makePublicClient() {
  const env = getServerEnv();
  return createPublicClient({
    chain: makeChain(),
    transport: http(env.MONAD_RPC_URL, { timeout: 10_000, retryCount: 1 }),
  });
}

function makeRelayer(account: PrivateKeyAccount) {
  const env = getServerEnv();
  return createWalletClient({
    account,
    chain: makeChain(),
    transport: http(env.MONAD_RPC_URL, { timeout: 10_000, retryCount: 1 }),
  });
}

let chainCache: ReturnType<typeof makeChain> | undefined;
let publicClientCache: ReturnType<typeof makePublicClient> | undefined;
let relayerCache:
  | { account: PrivateKeyAccount; wallet: ReturnType<typeof makeRelayer> }
  | null
  | undefined;

export function getServerChain() {
  if (!chainCache) {
    chainCache = makeChain();
  }
  return chainCache;
}

export function getPublicClient() {
  if (!publicClientCache) {
    publicClientCache = makePublicClient();
  }
  return publicClientCache;
}

/** Relayer wallet from RELAYER_PRIVATE_KEY, or null when the key is not configured. */
export function getRelayer() {
  if (relayerCache === undefined) {
    const key = getServerEnv().RELAYER_PRIVATE_KEY;
    if (!key) {
      relayerCache = null;
    } else {
      const account = privateKeyToAccount(key as `0x${string}`);
      relayerCache = { account, wallet: makeRelayer(account) };
    }
  }
  return relayerCache;
}

/** Env strings are regex-validated 20-byte hex; narrow them for viem. */
export function asAddress(value: string): Address {
  return value as Address;
}
