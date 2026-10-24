// scripts/relayer.ts — polling relayer: every 1000 ms read Mavera.pending(); when it is above zero
// send sync() from RELAYER_PRIVATE_KEY (gas limit 200000, maxFeePerGas 200 gwei,
// maxPriorityFeePerGas 2 gwei), wait for the receipt before the next send, and log block, hash and
// the distributed amount (Synced event). sync() is permissionless and idempotent, so this loop is the
// source of truth even when the web app's onAfterSettle trigger also fires.
//
// Usage (from scripts/): pnpm relayer     (= tsx --env-file=../.env relayer.ts); Ctrl-C exits cleanly.
// Spec: docs/02-CONTRACT-SPEC.md (sync), docs/03-X402-FLOW.md section 6, docs/10-MONAD-NOTES.md
// (reserve balance: keep the relayer above 10 MON; Monad charges the gas limit, not the gas used).
import { createWalletClient, http, parseEventLogs, parseGwei } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  errorMessage,
  explorerAddress,
  explorerTx,
  formatMon,
  formatUsdc,
  loadEnv,
  log,
  maveraAbi,
  monad,
  publicClient,
  readMaveraState,
  requireKey,
  requireMavera,
} from "./lib.js";

const TICK_MS = 1000;
const GAS_LIMIT = 200_000n;
const MAX_FEE_PER_GAS = parseGwei("200");
const MAX_PRIORITY_FEE_PER_GAS = parseGwei("2");
const RECEIPT_TIMEOUT_MS = 60_000;
const MIN_RELAYER_MON = 10n * 10n ** 18n;
const HEARTBEAT_EVERY_TICKS = 60;

/** Map the usual Monad / viem failure modes to one actionable line; every one is retried next tick. */
function classifyError(error: unknown): string {
  const message = errorMessage(error);
  const lower = message.toLowerCase();
  if (lower.includes("insufficient") && (lower.includes("balance") || lower.includes("funds"))) {
    return `insufficient MON for the gas limit (reserve-balance budget = min(10 MON, balance 3 blocks ago)); fund the relayer with > 10 MON: ${message}`;
  }
  if (lower.includes("reserve")) {
    return `reserve balance: in-flight gas exceeds the consensus budget; waiting a tick: ${message}`;
  }
  if (lower.includes("nonce too low") || lower.includes("already known") || lower.includes("replacement")) {
    return `nonce conflict (a previous sync is still in flight or landed); retrying next tick: ${message}`;
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return `no receipt within ${RECEIPT_TIMEOUT_MS / 1000} s; the tx may still land, the next pending() read decides: ${message}`;
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return `RPC rate limit (public testnet RPC: 25 rps eth_call); backing off one tick: ${message}`;
  }
  return message;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const mavera = requireMavera(env);
  const account = privateKeyToAccount(requireKey(env, "RELAYER_PRIVATE_KEY"));
  const client = publicClient(env);
  const wallet = createWalletClient({
    account,
    chain: monad,
    transport: http(env.MONAD_RPC_URL, { retryCount: 2, timeout: 15_000 }),
  });

  log(`relayer ${account.address} (${explorerAddress(env, account.address)})`);
  log(`Mavera ${mavera} (${explorerAddress(env, mavera)}) on chain ${monad.id} via ${env.MONAD_RPC_URL}`);
  log(`sync() params: gas ${GAS_LIMIT}, maxFeePerGas 200 gwei, maxPriorityFeePerGas 2 gwei, tick ${TICK_MS} ms`);

  const balance = await client.getBalance({ address: account.address });
  log(`relayer MON balance: ${formatMon(balance)}`);
  if (balance < MIN_RELAYER_MON) {
    log(
      `WARNING: balance below 10 MON; the consensus gas budget is min(10 MON, balance) and each sync reserves ${GAS_LIMIT} gas * 200 gwei = 0.04 MON. Fund the relayer (faucet.monad.xyz / blitz.devnads.com).`,
    );
  }

  const initial = await readMaveraState(client, mavera);
  log(
    `Mavera state: pending=${formatUsdc(initial.pending)} totalDistributed=${formatUsdc(initial.totalDistributed)} totalSupply=${initial.totalSupply} accounted=${formatUsdc(initial.accounted)}`,
  );
  if (initial.totalSupply === 0n) {
    log("WARNING: totalSupply is 0; sync() would be a no-op, so pending USDC stays pending until shares exist");
  }

  const stats = { syncs: 0, distributed: 0n, errors: 0, ticks: 0 };
  let stopping = false;
  let inFlight = false;
  let warnedNoSupply = false;

  async function tick(): Promise<void> {
    if (stopping || inFlight) return;
    inFlight = true;
    stats.ticks += 1;
    try {
      const state = await readMaveraState(client, mavera);
      if (state.pending === 0n) {
        if (stats.ticks % HEARTBEAT_EVERY_TICKS === 0) {
          log(`idle: pending 0, totalDistributed ${formatUsdc(state.totalDistributed)}, syncs sent ${stats.syncs}`);
        }
        return;
      }
      if (state.totalSupply === 0n) {
        if (!warnedNoSupply) {
          log(`pending ${formatUsdc(state.pending)} but totalSupply is 0: sync() cannot distribute; waiting for shares`);
          warnedNoSupply = true;
        }
        return;
      }
      warnedNoSupply = false;

      log(`pending ${formatUsdc(state.pending)} -> sending sync()`);
      const hash = await wallet.writeContract({
        address: mavera,
        abi: maveraAbi,
        functionName: "sync",
        gas: GAS_LIMIT,
        maxFeePerGas: MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
      });
      log(`sent ${hash}`);

      const receipt = await client.waitForTransactionReceipt({
        hash,
        timeout: RECEIPT_TIMEOUT_MS,
        pollingInterval: 300,
      });
      const synced = parseEventLogs({ abi: maveraAbi, logs: receipt.logs, eventName: "Synced" });
      const amount = synced.reduce((sum, entry) => sum + entry.args.amount, 0n);

      if (receipt.status === "success") {
        stats.syncs += 1;
        stats.distributed += amount;
        log(
          `synced block ${receipt.blockNumber} tx ${hash} distributed ${formatUsdc(amount)} gasUsed ${receipt.gasUsed} -> ${explorerTx(env, hash)}`,
        );
        if (amount === 0n) {
          log("note: receipt has no Synced event (another relayer or the web trigger synced first); harmless");
        }
      } else {
        stats.errors += 1;
        log(`sync REVERTED in block ${receipt.blockNumber} tx ${hash} (${explorerTx(env, hash)})`);
      }
    } catch (error) {
      stats.errors += 1;
      log(`error: ${classifyError(error)}`);
    } finally {
      inFlight = false;
    }
  }

  const timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  void tick();

  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    log(`${signal} received, stopping${inFlight ? " (waiting for the in-flight sync)" : ""}`);
    const deadline = Date.now() + RECEIPT_TIMEOUT_MS + 5_000;
    while (inFlight && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    log(`done: ${stats.syncs} syncs, ${formatUsdc(stats.distributed)} distributed, ${stats.errors} errors, ${stats.ticks} ticks`);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(`[relayer] ${errorMessage(error)}`);
  process.exit(1);
});
