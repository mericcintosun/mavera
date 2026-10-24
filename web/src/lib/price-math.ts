// Pure helpers for the MON/USD payload (no network, unit-tested).
// All prices are handled as bigint scaled by 1e18; no floating point.

export const PYTH_VALID_FOR_S = 60;
export const STORK_VALID_FOR_S = 3600;

const TEN = BigInt(10);
const EIGHTEEN = BigInt(18);
export const PRICE_SCALE = TEN ** EIGHTEEN;
const ZERO = BigInt(0);
const TWO = BigInt(2);
const BPS = BigInt(10_000);
const NS_PER_S = BigInt(1_000_000_000);

/** Pyth (price, expo) -> 1e18-scaled value. `2131383, -8` -> 0.02131383e18. */
export function scaledFromPyth(price: bigint, expo: number): bigint {
  if (expo >= 0) {
    return price * TEN ** BigInt(expo) * PRICE_SCALE;
  }
  const digits = BigInt(-expo);
  if (digits <= EIGHTEEN) {
    return price * TEN ** (EIGHTEEN - digits);
  }
  return price / TEN ** (digits - EIGHTEEN);
}

/** Stork quantizedValue is already scaled by 1e18. */
export function scaledFromStork(quantizedValue: bigint): bigint {
  return quantizedValue;
}

/** Stork timestamps are in nanoseconds. */
export function storkTimestampSeconds(timestampNs: bigint): number {
  return Number(timestampNs / NS_PER_S);
}

/** Decimal string of a 1e18-scaled value, trailing zeros trimmed, at most `maxDecimals`. */
export function formatScaled(value: bigint, maxDecimals = 8): string {
  const negative = value < ZERO;
  const abs = negative ? -value : value;
  const whole = (abs / PRICE_SCALE).toString();
  const frac = (abs % PRICE_SCALE)
    .toString()
    .padStart(18, "0")
    .slice(0, maxDecimals)
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

function compareBig(a: bigint, b: bigint): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/** Median of the values; for an even count the mean of the two middle values (floored). */
export function medianScaled(values: readonly bigint[]): bigint | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort(compareBig);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / TWO;
}

/** Relative gap between two prices in basis points, rounded to the nearest integer. */
export function spreadBps(a: bigint, b: bigint): number {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  if (lo <= ZERO) {
    return 0;
  }
  return Number(((hi - lo) * BPS + lo / TWO) / lo);
}

/** Age in whole seconds, floored at 0 (publish times can lead the block by clock skew). */
export function sourceAge(blockTimestamp: number, publishedAt: number): number {
  return Math.max(0, Math.floor(blockTimestamp - publishedAt));
}

/** Per-source validity: Pyth 60 s, Stork 3600 s. Never a flat threshold. */
export function isSourceValid(ageS: number, validForS: number): boolean {
  return Number.isFinite(ageS) && ageS >= 0 && ageS <= validForS;
}
