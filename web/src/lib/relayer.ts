// Server-only: sends Mavera.sync() from the relayer key after a settled x402 payment.
// Never throws into the response path; coalesces concurrent triggers into one
// in-flight transaction (sync() is permissionless and idempotent, so a duplicate
// is only wasted gas). The scripts/relayer poller remains the source of truth.
import { maveraAbi } from "./abi/mavera";
import {
  asAddress,
  getPublicClient,
  getRelayer,
  getServerChain,
} from "./clients";
import { getServerEnv, isDeployedAddress } from "./env";
import { recordSyncTx } from "./state";

const GWEI = BigInt(1_000_000_000);
/** Monad charges on the gas limit; sync() needs well under 200k. */
export const SYNC_GAS_LIMIT = BigInt(200_000);
export const SYNC_MAX_FEE_PER_GAS = BigInt(200) * GWEI;
export const SYNC_MAX_PRIORITY_FEE_PER_GAS = BigInt(2) * GWEI;
const ZERO = BigInt(0);

let inFlight: Promise<void> | null = null;
let rerun = false;

/** Fire-and-forget safe: resolves when this round is done, never rejects. */
export function triggerSync(reason: string): Promise<void> {
  if (inFlight) {
    rerun = true;
    return inFlight;
  }
  inFlight = runSync(reason)
    .catch((error) => {
      console.error("[relayer] sync failed:", String(error));
    })
    .finally(() => {
      inFlight = null;
      if (rerun) {
        rerun = false;
        void triggerSync("coalesced");
      }
    });
  return inFlight;
}

async function runSync(reason: string): Promise<void> {
  const env = getServerEnv();
  if (!isDeployedAddress(env.MAVERA_ADDRESS)) {
    console.warn(
      "[relayer] MAVERA_ADDRESS is the zero placeholder; skipping sync",
    );
    return;
  }
  const relayer = getRelayer();
  if (!relayer) {
    console.warn("[relayer] RELAYER_PRIVATE_KEY not set; skipping sync");
    return;
  }
  const client = getPublicClient();
  const mavera = asAddress(env.MAVERA_ADDRESS);
  const pending = await client.readContract({
    address: mavera,
    abi: maveraAbi,
    functionName: "pending",
  });
  if (pending === ZERO) {
    console.log(`[relayer] nothing pending (${reason}); skipping sync`);
    return;
  }
  const hash = await relayer.wallet.writeContract({
    account: relayer.account,
    chain: getServerChain(),
    address: mavera,
    abi: maveraAbi,
    functionName: "sync",
    gas: SYNC_GAS_LIMIT,
    maxFeePerGas: SYNC_MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: SYNC_MAX_PRIORITY_FEE_PER_GAS,
  });
  console.log(
    JSON.stringify({
      event: "sync_sent",
      reason,
      pending: pending.toString(),
      hash,
    }),
  );
  const receipt = await client.waitForTransactionReceipt({
    hash,
    pollingInterval: 500,
    timeout: 30_000,
  });
  recordSyncTx(hash, Number(receipt.blockNumber));
  console.log(
    JSON.stringify({
      event: "sync_mined",
      hash,
      status: receipt.status,
      block: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
    }),
  );
}
