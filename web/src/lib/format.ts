// Pure formatting helpers (docs/04-FRONTEND.md section 6). Integer math only.

const TEN = BigInt(10);
export const ZERO = BigInt(0);
const ONE = BigInt(1);
const HUNDRED = BigInt(100);
const THOUSAND = BigInt(1000);
export const SHARE_SCALE = TEN ** BigInt(18);
export const USDC_SCALE = BigInt(1_000_000);
const MON_SCALE = TEN ** BigInt(18);

/** Contract cost rule: ceil(shares * sharePrice / 1e18) in USDC atomic units. */
export function ceilCost(shares: bigint, sharePrice: bigint): bigint {
  if (shares <= ZERO || sharePrice <= ZERO) {
    return ZERO;
  }
  return (shares * sharePrice + SHARE_SCALE - ONE) / SHARE_SCALE;
}

/** "5" or "2.5" (up to 18 decimals) -> share-wei; null when not a positive number. */
export function parseShares(input: string): bigint | null {
  const match = input.trim().match(/^(\d+)(?:\.(\d{1,18}))?$/);
  if (!match) {
    return null;
  }
  const whole = BigInt(match[1]);
  const frac = match[2] ? BigInt(match[2].padEnd(18, "0")) : ZERO;
  const value = whole * SHARE_SCALE + frac;
  return value > ZERO ? value : null;
}

export function withThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatInt(value: number | bigint | string): string {
  return withThousands(String(value));
}

/**
 * USDC atomic units -> decimal amount. `auto`: two decimals, more only when
 * there is a non-zero sub-cent part. `exact`: all six decimals (claimable, claimed).
 */
export function formatUsdcAmount(
  atomic: bigint,
  mode: "auto" | "exact" = "auto",
): string {
  const negative = atomic < ZERO;
  const abs = negative ? -atomic : atomic;
  const whole = withThousands((abs / USDC_SCALE).toString());
  const frac6 = (abs % USDC_SCALE).toString().padStart(6, "0");
  let frac = frac6;
  if (mode === "auto") {
    const trimmed = frac6.replace(/0+$/, "");
    frac = trimmed.length <= 2 ? frac6.slice(0, 2) : trimmed;
  }
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** "$0.47 USDC" / "$0.282000 USDC" */
export function formatUsdc(
  atomic: bigint,
  mode: "auto" | "exact" = "auto",
): string {
  return `$${formatUsdcAmount(atomic, mode)} USDC`;
}

/** Share-wei -> whole shares, up to two decimals when fractional. */
export function formatShares(wei: bigint): string {
  const whole = withThousands((wei / SHARE_SCALE).toString());
  const rem = wei % SHARE_SCALE;
  if (rem === ZERO) {
    return whole;
  }
  const two = ((rem * HUNDRED) / SHARE_SCALE)
    .toString()
    .padStart(2, "0")
    .replace(/0+$/, "");
  return two ? `${whole}.${two}` : whole;
}

/** One-decimal percent of supply, e.g. "20.0". */
export function percentOfSupply(balance: bigint, total: bigint): string {
  if (total <= ZERO) {
    return "0.0";
  }
  const tenths = (balance * THOUSAND) / total;
  return `${tenths / TEN}.${tenths % TEN}`;
}

/** "3 s ago" / "1 m 12 s ago" / "1 h 02 m ago" */
export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) {
    return `${s} s ago`;
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)} m ${String(s % 60).padStart(2, "0")} s ago`;
  }
  const minutes = Math.floor((s % 3600) / 60);
  return `${Math.floor(s / 3600)} h ${String(minutes).padStart(2, "0")} m ago`;
}

/** "0x1234…abcd" */
export function shortHex(hex: string): string {
  if (hex.length <= 12) {
    return hex;
  }
  return `${hex.slice(0, 6)}…${hex.slice(-4)}`;
}

/** Gas fee in wei -> "0.0153 MON" */
export function formatMon(wei: bigint): string {
  const whole = wei / MON_SCALE;
  const frac = (wei % MON_SCALE).toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${frac} MON`;
}

export function toBig(value: string | null | undefined): bigint {
  if (!value) {
    return ZERO;
  }
  try {
    return BigInt(value);
  } catch {
    return ZERO;
  }
}

/** True for wallet "user rejected" errors (EIP-1193 code 4001 or viem's UserRejectedRequestError). */
export function isUserRejected(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const e = error as {
    name?: string;
    code?: number;
    message?: string;
    cause?: unknown;
  };
  if (e.name === "UserRejectedRequestError" || e.code === 4001) {
    return true;
  }
  if (
    typeof e.message === "string" &&
    /user rejected|user denied/i.test(e.message)
  ) {
    return true;
  }
  return e.cause ? isUserRejected(e.cause) : false;
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { shortMessage?: string; message?: string };
    if (typeof e.shortMessage === "string") {
      return e.shortMessage;
    }
    if (typeof e.message === "string") {
      return e.message;
    }
  }
  return String(error);
}
