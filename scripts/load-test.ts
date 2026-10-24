// scripts/load-test.ts — N sequential paid x402 calls (one in flight at a time) from the demo
// customer wallet against GET /api/price. Prints per-call latency and settlement hash, then a
// summary (success count, total USDC paid, p50/p95 latency) and the Mavera totalDistributed /
// pending counters before and after. Writes everything to scripts/out/load-<timestamp>.json.
//
// Usage (from scripts/): pnpm load-test            # 50 calls
//                        pnpm load-test -- 20      # 20 calls (or LOAD_CALLS=20)
// Spec: docs/03-X402-FLOW.md section 7, docs/07-RUNBOOK.md (rehearsal).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PaymentRequirements } from "@x402/core/types";
import { privateKeyToAccount } from "viem/accounts";
import {
  apiUrl,
  createPaidFetch,
  decodeRequired,
  decodeSettle,
  describeRequirements,
  errorMessage,
  explainFacilitatorError,
  explorerTx,
  formatUsdc,
  jsonReplacer,
  loadEnv,
  log,
  type MaveraState,
  percentile,
  publicClient,
  readMaveraState,
  requireMavera,
  usdcBalance,
} from "./lib.js";

interface CallResult {
  i: number;
  status: number;
  ms: number;
  ok: boolean;
  transaction?: string;
  amount?: string;
  error?: string;
}

function parseCalls(): number {
  const raw = process.argv[2] ?? process.env.LOAD_CALLS ?? "50";
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`invalid call count "${raw}" (argument or LOAD_CALLS must be a positive integer)`);
  }
  return n;
}

function describeState(state: MaveraState): string {
  return `totalDistributed=${formatUsdc(state.totalDistributed)} pending=${formatUsdc(state.pending)} accounted=${formatUsdc(state.accounted)} totalSupply=${state.totalSupply}`;
}

async function main(): Promise<number> {
  const env = loadEnv();
  const calls = parseCalls();
  const mavera = requireMavera(env);
  const account = privateKeyToAccount(requireKey(env));
  const client = publicClient(env);
  const url = apiUrl(env);

  // Holder with methods: the hook assigns from a closure, which TS control-flow analysis cannot see,
  // so plain property reads would be narrowed to `undefined` after the per-call reset.
  const signed = {
    value: undefined as PaymentRequirements | undefined,
    set(req: PaymentRequirements) {
      this.value = req;
    },
    reset() {
      this.value = undefined;
    },
    get(): PaymentRequirements | undefined {
      return this.value;
    },
  };
  const { lock, fetchWithPayment } = createPaidFetch(env, account, {
    onRequirements: (req) => signed.set(req),
  });

  log(`load test: ${calls} sequential paid calls to ${url}`);
  log(`customer ${account.address}; route lock payTo=${lock.payTo} asset=${lock.asset} network=${lock.network}`);

  const [usdcBefore, stateBefore] = await Promise.all([
    usdcBalance(client, env, account.address),
    readMaveraState(client, mavera),
  ]);
  log(`USDC balance before: ${formatUsdc(usdcBefore)}`);
  log(`Mavera before: ${describeState(stateBefore)}`);

  const startedAt = new Date();
  const results: CallResult[] = [];

  for (let i = 1; i <= calls; i++) {
    signed.reset();
    const t0 = performance.now();
    try {
      const res = await fetchWithPayment(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const ms = Math.round(performance.now() - t0);
      await res.arrayBuffer(); // drain the body; the payload itself is not needed here
      const settle = decodeSettle(res);
      const ok = res.ok && settle?.success === true;
      const result: CallResult = {
        i,
        status: res.status,
        ms,
        ok,
        transaction: settle?.transaction || undefined,
        amount: ok ? (settle?.amount ?? signed.get()?.amount) : undefined,
      };
      if (!ok) {
        const reason = settle?.errorReason ?? decodeRequired(res)?.error;
        result.error = res.ok
          ? "200 without PAYMENT-RESPONSE (served unpaid)"
          : explainFacilitatorError(reason);
      }
      results.push(result);
      log(
        ok
          ? `#${i} ${res.status} ${ms} ms tx ${result.transaction}`
          : `#${i} ${res.status} ${ms} ms FAILED: ${result.error}`,
      );
    } catch (error) {
      const ms = Math.round(performance.now() - t0);
      const message = errorMessage(error);
      results.push({ i, status: 0, ms, ok: false, error: message });
      log(`#${i} ERROR ${ms} ms: ${message}`);
      if (message.includes("route lock")) {
        log("route lock refused the challenge; stopping (nothing was signed)");
        break;
      }
    }
  }
  const finishedAt = new Date();

  const [usdcAfter, stateAfter] = await Promise.all([
    usdcBalance(client, env, account.address),
    readMaveraState(client, mavera),
  ]);

  const successes = results.filter((r) => r.ok);
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const okLatencies = successes.map((r) => r.ms).sort((a, b) => a - b);
  const totalPaid = successes.reduce((sum, r) => sum + BigInt(r.amount ?? "0"), 0n);
  const summary = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    apiUrl: url,
    network: lock.network,
    mavera,
    customer: account.address,
    requested: calls,
    attempted: results.length,
    success: successes.length,
    failed: results.length - successes.length,
    totalPaidAtomic: totalPaid,
    totalPaidUsdc: formatUsdc(totalPaid),
    usdcBalanceDeltaAtomic: usdcBefore - usdcAfter,
    latencyMsAll: {
      min: latencies[0] ?? 0,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies[latencies.length - 1] ?? 0,
      avg: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    },
    latencyMsSettled: {
      p50: percentile(okLatencies, 50),
      p95: percentile(okLatencies, 95),
    },
    wallClockMs: finishedAt.getTime() - startedAt.getTime(),
    usdcBefore,
    usdcAfter,
    maveraBefore: stateBefore,
    maveraAfter: stateAfter,
    settlementHashes: successes.map((r) => r.transaction),
    explorerTxPrefix: explorerTx(env, ""),
    results,
  };

  const outDir = join(dirname(fileURLToPath(import.meta.url)), "out");
  mkdirSync(outDir, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const outFile = join(outDir, `load-${stamp}.json`);
  writeFileSync(outFile, JSON.stringify(summary, jsonReplacer, 2));

  console.log("");
  log(`calls: ${summary.success}/${summary.attempted} settled (${summary.failed} failed)`);
  log(`total paid: ${summary.totalPaidUsdc} (balance delta ${formatUsdc(summary.usdcBalanceDeltaAtomic)})`);
  log(
    `latency ms: min ${summary.latencyMsAll.min} p50 ${summary.latencyMsAll.p50} p95 ${summary.latencyMsAll.p95} max ${summary.latencyMsAll.max} avg ${summary.latencyMsAll.avg}; wall clock ${summary.wallClockMs} ms`,
  );
  log(`USDC balance after: ${formatUsdc(usdcAfter)}`);
  log(`Mavera before: ${describeState(stateBefore)}`);
  log(`Mavera after:  ${describeState(stateAfter)}`);
  log(
    `distributed during the run: ${formatUsdc(stateAfter.totalDistributed - stateBefore.totalDistributed)}; still pending (relayer not caught up): ${formatUsdc(stateAfter.pending)}`,
  );
  const lastSigned = signed.get();
  if (lastSigned) log(`last signed requirement: ${describeRequirements(lastSigned)}`);
  log(`report: ${outFile}`);

  return summary.failed === 0 && summary.success > 0 ? 0 : 1;
}

function requireKey(env: ReturnType<typeof loadEnv>) {
  if (!env.CUSTOMER_PRIVATE_KEY) {
    throw new Error("CUSTOMER_PRIVATE_KEY is empty in .env (0x + 64 hex chars; testnet only)");
  }
  return env.CUSTOMER_PRIVATE_KEY as `0x${string}`;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`[load-test] ${errorMessage(error)}`);
    process.exit(1);
  });
