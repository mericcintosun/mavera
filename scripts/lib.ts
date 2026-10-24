// scripts/lib.ts — shared helpers for the Mavera demo scripts (customer.ts, load-test.ts, relayer.ts).
//
// - env parsing with zod (same variable names as ../.env.example and web/src/lib/env.ts)
// - a viem public client for Monad testnet (chain 10143, explorer https://testnet.monadscan.com)
// - the compiled Mavera ABI (scripts/abi.ts, generated from the Foundry artifact by gen-abi.ts)
// - USDC (6 decimals) / shares (18 decimals) formatting
// - the x402 route-locked client factory (docs/03-X402-FLOW.md section 7)
//
// Scripts run with `tsx --env-file=../.env <file>` from the scripts directory.
import { x402Client } from "@x402/core/client";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
} from "@x402/core/http";
import type {
  Network,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { maveraAbi } from "./abi.js";
import {
  type Address,
  BaseError,
  createPublicClient,
  defineChain,
  erc20Abi,
  formatUnits,
  type Hex,
  http,
  isAddressEqual,
  zeroAddress,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected a 0x-prefixed 20-byte hex address");

const hexPrivateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected a 0x-prefixed 32-byte hex private key");

// Keys are optional at parse time so that each script can demand only the one it needs.
const optionalPrivateKey = hexPrivateKey.optional().or(z.literal(""));

export const envSchema = z.object({
  MONAD_RPC_URL: z.string().url(),
  X402_NETWORK: z
    .string()
    .regex(/^eip155:\d+$/, "expected a CAIP-2 id such as eip155:10143")
    .default("eip155:10143"),
  X402_FACILITATOR_URL: z.string().url(),
  USDC_ADDRESS: hexAddress,
  MAVERA_ADDRESS: hexAddress,
  API_URL: z.string().url(),
  CUSTOMER_PRIVATE_KEY: optionalPrivateKey,
  RELAYER_PRIVATE_KEY: optionalPrivateKey,
  NEXT_PUBLIC_EXPLORER_URL: z
    .string()
    .url()
    .default("https://testnet.monadscan.com"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `invalid environment (run with: tsx --env-file=../.env <script>; template: .env.example)\n${issues}`,
    );
  }
  return parsed.data;
}

/** MAVERA_ADDRESS must be a deployed contract, not the .env.example placeholder. */
export function requireMavera(env: Env): Address {
  const address = env.MAVERA_ADDRESS as Address;
  if (isAddressEqual(address, zeroAddress)) {
    throw new Error(
      "MAVERA_ADDRESS is the zero address: deploy first (scripts/deploy.sh) and set MAVERA_ADDRESS, NEXT_PUBLIC_MAVERA_ADDRESS and PAY_TO in .env",
    );
  }
  return address;
}

export function requireKey(
  env: Env,
  name: "CUSTOMER_PRIVATE_KEY" | "RELAYER_PRIVATE_KEY",
): Hex {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is empty in .env (0x + 64 hex chars; testnet only)`);
  }
  return value as Hex;
}

// ---------------------------------------------------------------------------
// Chain and clients
// ---------------------------------------------------------------------------

/** viem's monadTestnet with the Monadscan explorer and the measured 300 ms block time. */
export const monad = defineChain({
  ...monadTestnet,
  blockTime: 300,
  blockExplorers: {
    default: { name: "Monadscan", url: "https://testnet.monadscan.com" },
  },
});

export function publicClient(env: Env) {
  return createPublicClient({
    chain: monad,
    transport: http(env.MONAD_RPC_URL, { retryCount: 3, timeout: 15_000 }),
  });
}

export type MaveraPublicClient = ReturnType<typeof publicClient>;

// ---------------------------------------------------------------------------
// Mavera ABI (generated: scripts/abi.ts; regenerate with `pnpm --filter @mavera/scripts abi`)
// ---------------------------------------------------------------------------

export { maveraAbi };

export interface MaveraState {
  pending: bigint;
  totalDistributed: bigint;
  totalSupply: bigint;
  accounted: bigint;
}

/** One eth_call (Multicall3) for the four counters the scripts report. */
export async function readMaveraState(
  client: MaveraPublicClient,
  mavera: Address,
): Promise<MaveraState> {
  const base = { address: mavera, abi: maveraAbi } as const;
  const [pending, totalDistributed, totalSupply, accounted] = await client.multicall({
    allowFailure: false,
    contracts: [
      { ...base, functionName: "pending" },
      { ...base, functionName: "totalDistributed" },
      { ...base, functionName: "totalSupply" },
      { ...base, functionName: "accounted" },
    ],
  });
  return { pending, totalDistributed, totalSupply, accounted };
}

export async function usdcBalance(
  client: MaveraPublicClient,
  env: Env,
  holder: Address,
): Promise<bigint> {
  return client.readContract({
    address: env.USDC_ADDRESS as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [holder],
  });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const USDC_DECIMALS = 6;
export const SHARE_DECIMALS = 18;

export function formatUsdc(atomic: bigint): string {
  return `${formatUnits(atomic, USDC_DECIMALS)} USDC`;
}

export function formatShares(wei: bigint): string {
  return `${formatUnits(wei, SHARE_DECIMALS)} shares`;
}

export function formatMon(wei: bigint): string {
  return `${formatUnits(wei, 18)} MON`;
}

export function explorerTx(env: Env, hash: string): string {
  return `${env.NEXT_PUBLIC_EXPLORER_URL.replace(/\/$/, "")}/tx/${hash}`;
}

export function explorerAddress(env: Env, address: string): string {
  return `${env.NEXT_PUBLIC_EXPLORER_URL.replace(/\/$/, "")}/address/${address}`;
}

export function apiUrl(env: Env, path = "/api/price"): string {
  return `${env.API_URL.replace(/\/$/, "")}${path}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function log(message: string): void {
  console.log(`[${nowIso()}] ${message}`);
}

/** p-th percentile of an ascending-sorted array (nearest-rank). */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, rank))] ?? 0;
}

/** JSON.stringify replacer so bigint values become decimal strings. */
export function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** Human-readable message for any thrown value (viem errors carry shortMessage + details). */
export function errorMessage(error: unknown): string {
  if (error instanceof BaseError) {
    const details = error.details ? ` (${error.details})` : "";
    return `${error.shortMessage}${details}`;
  }
  if (error instanceof Error) {
    return error.cause instanceof Error
      ? `${error.message} <- ${error.cause.message}`
      : error.message;
  }
  return String(error);
}

// ---------------------------------------------------------------------------
// x402 client with the route lock (docs/03-X402-FLOW.md section 7)
// ---------------------------------------------------------------------------

export interface RouteLock {
  payTo: Address;
  asset: Address;
  network: Network;
  scheme: "exact";
}

export function routeLock(env: Env): RouteLock {
  return {
    payTo: requireMavera(env),
    asset: env.USDC_ADDRESS as Address,
    network: env.X402_NETWORK as Network,
    scheme: "exact",
  };
}

/** Returns null when the requirement satisfies the lock, otherwise the first mismatch. */
export function lockMismatch(req: PaymentRequirements, lock: RouteLock): string | null {
  if (req.scheme !== lock.scheme) return `scheme ${req.scheme} != ${lock.scheme}`;
  if (req.network !== lock.network) return `network ${req.network} != ${lock.network}`;
  if (!isHexAddress(req.payTo) || !isAddressEqual(req.payTo, lock.payTo)) {
    return `payTo ${req.payTo} != MAVERA_ADDRESS ${lock.payTo}`;
  }
  if (!isHexAddress(req.asset) || !isAddressEqual(req.asset, lock.asset)) {
    return `asset ${req.asset} != USDC_ADDRESS ${lock.asset}`;
  }
  return null;
}

function isHexAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function describeRequirements(req: PaymentRequirements): string {
  return `${req.scheme}@${req.network} amount=${req.amount} asset=${req.asset} payTo=${req.payTo} timeout=${req.maxTimeoutSeconds}s`;
}

export interface PaidFetchHooks {
  /** Called with the requirement that passed the lock, right before it is signed. */
  onRequirements?: (req: PaymentRequirements) => void;
}

/**
 * x402Client + client ExactEvmScheme (EIP-3009 signer) + wrapFetchWithPayment, with the route lock
 * enforced twice: the requirements selector only picks a matching option, and the
 * onBeforePaymentCreation hook aborts before any signature if the selection does not match.
 * Spend controls stay at the SDK defaults ($1 per payment, default-table assets; Monad testnet USDC
 * is in the 2.28.0 default table).
 */
export function createPaidFetch(env: Env, account: PrivateKeyAccount, hooks: PaidFetchHooks = {}) {
  const lock = routeLock(env);

  const client = new x402Client((_x402Version, accepts) => {
    const match = accepts.find((req) => lockMismatch(req, lock) === null);
    if (!match) {
      const offered = accepts.map(describeRequirements).join(" | ") || "(none)";
      throw new Error(`route lock: no acceptable payment option; offered: ${offered}`);
    }
    return match;
  })
    .register(lock.network, new ExactEvmScheme(account))
    .onBeforePaymentCreation(async ({ selectedRequirements }) => {
      const mismatch = lockMismatch(selectedRequirements, lock);
      if (mismatch) return { abort: true as const, reason: `route lock: ${mismatch}` };
      hooks.onRequirements?.(selectedRequirements);
    });

  return { client, lock, fetchWithPayment: wrapFetchWithPayment(fetch, client) };
}

export async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** PAYMENT-RESPONSE header (200 after settlement, or 402 after a settlement failure). */
export function decodeSettle(res: Response): SettleResponse | null {
  const header = res.headers.get("PAYMENT-RESPONSE");
  if (!header) return null;
  try {
    return decodePaymentResponseHeader(header);
  } catch {
    return null;
  }
}

/** PAYMENT-REQUIRED header (402; its `error` field carries the server's reason on a failed retry). */
export function decodeRequired(res: Response): PaymentRequired | null {
  const header = res.headers.get("PAYMENT-REQUIRED");
  if (!header) return null;
  try {
    return decodePaymentRequiredHeader(header);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Error vocabulary (docs/03-X402-FLOW.md section 12)
// ---------------------------------------------------------------------------

export const FACILITATOR_ERRORS: Record<string, string> = {
  insufficient_funds:
    "the customer's USDC balance is below the price; fund the wallet at https://faucet.circle.com (Monad Testnet, 20 USDC per address every 2 h)",
  invalid_payment_amount:
    "authorization.value differs from the required amount (client/server price mismatch)",
  accepted_requirements_mismatch:
    "paymentPayload.accepted differs from the server's paymentRequirements",
  invalid_payment_expired:
    "validBefore already passed when the facilitator checked: clock skew or a stale retry (keep X402_MAX_TIMEOUT_SECONDS >= 60, default 300)",
  invalid_exact_evm_payload_authorization_valid_before:
    "the signed validity window ended before settlement (settlement slower than maxTimeoutSeconds)",
  unsupported_scheme:
    "scheme or network not supported by the facilitator; expected scheme exact on eip155:10143 (check X402_NETWORK and the route config)",
  invalid_format:
    "the facilitator could not deserialize the request (for example an empty signature)",
  unexpected_error:
    "the facilitator's eth_call simulation reverted; the revert string is in the details (ECRecover: invalid signature, Blacklistable: account is blacklisted, FiatTokenV2: ...)",
  settlement_pending:
    "the settlement transaction was broadcast but has no receipt yet; the outcome is indeterminate, check the transaction hash on the explorer",
  handler_failed:
    "the server handler answered with status >= 400 after verification; nothing was settled",
  handler_threw: "the server handler threw after verification; nothing was settled",
};

export function explainFacilitatorError(reason: string | undefined): string {
  if (!reason) return "no error reason was reported";
  const known = FACILITATOR_ERRORS[reason];
  if (known) return `${reason}: ${known}`;
  const onChain = Object.entries(USDC_REVERTS).find(([needle]) => reason.includes(needle));
  if (onChain) return `${reason}: ${onChain[1]}`;
  return `${reason}: not in the known vocabulary (see docs/03-X402-FLOW.md section 12)`;
}

export const USDC_REVERTS: Record<string, string> = {
  "authorization is expired": "now >= validBefore at execution: window too short or settlement too slow",
  "authorization is not yet valid": "now <= validAfter (only hand-rolled payloads; the SDK signs validAfter 0)",
  "authorization is used or canceled": "nonce replay; harmless for Mavera because funds only move into the contract",
  "invalid signature": "wrong EIP-712 domain (name must be USDC, version 2) or wrong chain id",
  "caller must be the payee": "fallback F2 receiveWithAuthorization sent by someone other than `to`",
  "Blacklistable": "payer or payTo is blacklisted by the USDC contract (a USDC address pasted into PAY_TO looks like this)",
};
