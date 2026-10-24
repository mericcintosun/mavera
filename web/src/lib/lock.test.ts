import { describe, expect, it } from "vitest";
import {
  checkRequirement,
  LOCK_REFUSAL_PREFIX,
  type RouteLock,
  selectAllowedRequirement,
} from "./lock";

const MAVERA = "0x1111111111111111111111111111111111111111";
const USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";

const lock: RouteLock = {
  payTo: MAVERA,
  asset: USDC,
  network: "eip155:10143",
  scheme: "exact",
  maxAmount: BigInt(10_000),
};

const good = {
  scheme: "exact",
  network: "eip155:10143",
  asset: USDC.toLowerCase(),
  payTo: MAVERA.toUpperCase().replace("0X", "0x"),
  amount: "10000",
};

describe("route lock", () => {
  it("accepts the exact tuple, case-insensitively", () => {
    expect(checkRequirement(good, lock)).toEqual({ ok: true });
  });

  it("refuses a different payTo without signing", () => {
    const verdict = checkRequirement(
      { ...good, payTo: "0x2222222222222222222222222222222222222222" },
      lock,
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason.startsWith(LOCK_REFUSAL_PREFIX)).toBe(true);
    }
  });

  it("refuses a different asset, network, scheme or a higher amount", () => {
    expect(
      checkRequirement(
        { ...good, asset: "0x56bf9CDc3C1876F3F22655a0016C2743E9e39a73" },
        lock,
      ).ok,
    ).toBe(false);
    expect(checkRequirement({ ...good, network: "eip155:143" }, lock).ok).toBe(
      false,
    );
    expect(checkRequirement({ ...good, scheme: "upto" }, lock).ok).toBe(false);
    expect(checkRequirement({ ...good, amount: "10001" }, lock).ok).toBe(false);
    expect(checkRequirement({ ...good, amount: "x" }, lock).ok).toBe(false);
    expect(checkRequirement({ ...good, amount: "9999" }, lock).ok).toBe(true);
  });

  it("selects the first allowed requirement from a 402 list", () => {
    const bad = {
      ...good,
      payTo: "0x3333333333333333333333333333333333333333",
    };
    expect(selectAllowedRequirement([bad, good], lock)).toBe(good);
    expect(selectAllowedRequirement([bad], lock)).toBeUndefined();
  });
});
