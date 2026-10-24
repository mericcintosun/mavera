// scripts/customer.ts — one paid call from the demo customer wallet:
// GET /api/price -> 402 (PAYMENT-REQUIRED) -> sign a USDC EIP-3009 transferWithAuthorization ->
// retry with PAYMENT-SIGNATURE -> 200 + PAYMENT-RESPONSE (settlement tx hash).
//
// Route lock: the client refuses to sign unless the 402 names payTo == MAVERA_ADDRESS,
// asset == USDC_ADDRESS, network == X402_NETWORK and scheme == exact (docs/03-X402-FLOW.md section 7).
//
// Usage (from scripts/): pnpm customer      (= tsx --env-file=../.env customer.ts)
// Exit codes: 0 settled, 1 payment or transport failure, 2 the route answered 200 without a
// PAYMENT-RESPONSE header (served unpaid: route misconfigured).
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
  explorerAddress,
  explorerTx,
  formatUsdc,
  jsonReplacer,
  loadEnv,
  log,
  publicClient,
  readBody,
  requireKey,
  usdcBalance,
} from "./lib.js";

async function main(): Promise<number> {
  const env = loadEnv();
  const account = privateKeyToAccount(requireKey(env, "CUSTOMER_PRIVATE_KEY"));
  const client = publicClient(env);
  const url = apiUrl(env);

  let signed: PaymentRequirements | undefined;
  const { lock, fetchWithPayment } = createPaidFetch(env, account, {
    onRequirements: (req) => {
      signed = req;
      log(`route lock OK, signing: ${describeRequirements(req)}`);
    },
  });

  log(`customer ${account.address} (${explorerAddress(env, account.address)})`);
  log(`route lock: payTo=${lock.payTo} asset=${lock.asset} network=${lock.network} scheme=${lock.scheme}`);
  log(`GET ${url}`);

  const before = await usdcBalance(client, env, account.address);
  log(`USDC balance before: ${formatUsdc(before)}`);

  const started = performance.now();
  let res: Response;
  try {
    res = await fetchWithPayment(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    const message = errorMessage(error);
    log(`FAILED after ${Math.round(performance.now() - started)} ms: ${message}`);
    if (message.includes("route lock")) {
      log("the 402 challenge did not match the route lock; nothing was signed and nothing was paid");
    } else if (message.includes("Failed to parse payment requirements")) {
      log("the 402 carried no decodable PAYMENT-REQUIRED header (facilitator down -> 502, or not an x402 route)");
    } else if (message.includes("Payment already attempted")) {
      log("the server answered 402 again after PAYMENT-SIGNATURE was sent; treat the first payment as unknown and check the explorer");
    } else if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
      log(`cannot reach ${url}: is the web app running (pnpm dev) and API_URL correct?`);
    }
    return 1;
  }
  const elapsedMs = Math.round(performance.now() - started);

  const body = await readBody(res);
  const settle = decodeSettle(res);
  const required = decodeRequired(res);

  log(`status ${res.status} in ${elapsedMs} ms`);
  console.log(JSON.stringify(body, jsonReplacer, 2));

  if (settle) {
    log(`PAYMENT-RESPONSE: ${JSON.stringify(settle)}`);
    if (settle.success) {
      log(`settled on ${settle.network}: tx ${settle.transaction}`);
      log(`explorer: ${explorerTx(env, settle.transaction)}`);
      if (settle.payer) log(`payer: ${settle.payer}`);
    } else {
      log(`settlement FAILED: ${explainFacilitatorError(settle.errorReason)}`);
      if (settle.errorMessage) log(`details: ${settle.errorMessage}`);
      if (settle.transaction) log(`transaction: ${explorerTx(env, settle.transaction)}`);
    }
  }

  if (res.status === 402) {
    const reason = required?.error;
    log(`402 after payment: ${explainFacilitatorError(reason)}`);
    if (required) {
      log(`server accepts: ${required.accepts.map(describeRequirements).join(" | ")}`);
    }
  }

  const after = await usdcBalance(client, env, account.address);
  const delta = before - after;
  log(`USDC balance after: ${formatUsdc(after)} (paid ${formatUsdc(delta)})`);

  if (res.ok && !settle) {
    log("WARNING: 200 without PAYMENT-RESPONSE: the route served the resource unpaid (route config mismatch?)");
    return 2;
  }
  if (res.ok && settle?.success) {
    if (signed && delta !== BigInt(signed.amount)) {
      log(`note: balance delta ${delta} differs from the signed amount ${signed.amount} (concurrent activity?)`);
    }
    return 0;
  }
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`[customer] ${errorMessage(error)}`);
    process.exit(1);
  });
