import { describe, expect, it } from "vitest";
import {
  formatScaled,
  isSourceValid,
  medianScaled,
  PYTH_VALID_FOR_S,
  STORK_VALID_FOR_S,
  scaledFromPyth,
  scaledFromStork,
  sourceAge,
  spreadBps,
  storkTimestampSeconds,
} from "./price-math";

// Live values from research/price-data-source.md (2026-10-24 00:32:39Z).
const PYTH = scaledFromPyth(BigInt(2131383), -8);
const STORK = scaledFromStork(BigInt("21325689575000000"));

describe("oracle payload helpers", () => {
  it("formats Pyth (price, expo -8) as a decimal string", () => {
    expect(formatScaled(PYTH)).toBe("0.02131383");
    expect(formatScaled(scaledFromPyth(BigInt(123), 2))).toBe("12300");
    expect(formatScaled(scaledFromPyth(BigInt(500), -20), 18)).toBe(
      "0.000000000000000005",
    );
  });

  it("formats Stork 1e18 values and nanosecond timestamps", () => {
    expect(formatScaled(STORK, 12)).toBe("0.021325689575");
    expect(storkTimestampSeconds(BigInt("1792801887085906440"))).toBe(
      1792801887,
    );
  });

  it("takes the median of valid sources (mean of two)", () => {
    expect(medianScaled([])).toBeNull();
    expect(medianScaled([PYTH])).toBe(PYTH);
    expect(formatScaled(medianScaled([PYTH, STORK]) as bigint, 13)).toBe(
      "0.0213197597875",
    );
    expect(medianScaled([BigInt(3), BigInt(1), BigInt(2)])).toBe(BigInt(2));
  });

  it("computes the spread in basis points", () => {
    expect(spreadBps(PYTH, STORK)).toBe(6);
    expect(spreadBps(STORK, PYTH)).toBe(6);
    expect(spreadBps(PYTH, PYTH)).toBe(0);
    expect(spreadBps(BigInt(0), PYTH)).toBe(0);
  });

  it("applies per-source validity, never a flat threshold", () => {
    expect(PYTH_VALID_FOR_S).toBe(60);
    expect(STORK_VALID_FOR_S).toBe(3600);
    expect(isSourceValid(5, PYTH_VALID_FOR_S)).toBe(true);
    expect(isSourceValid(72, PYTH_VALID_FOR_S)).toBe(false);
    expect(isSourceValid(72, STORK_VALID_FOR_S)).toBe(true);
    expect(isSourceValid(3601, STORK_VALID_FOR_S)).toBe(false);
    expect(isSourceValid(Number.NaN, STORK_VALID_FOR_S)).toBe(false);
  });

  it("floors negative ages (publish time ahead of the block) at zero", () => {
    expect(sourceAge(1792801954, 1792801949)).toBe(5);
    expect(sourceAge(1792801954, 1792801960)).toBe(0);
  });
});
