import { describe, expect, it } from "vitest";
import {
  ceilCost,
  formatAge,
  formatMon,
  formatShares,
  formatUsdc,
  formatUsdcAmount,
  parseShares,
  percentOfSupply,
  shortHex,
} from "./format";

const SHARE_PRICE = BigInt(10_000); // 0.01 USDC per 1e18 share
const E18 = BigInt("1000000000000000000");

describe("cost and share formatting", () => {
  it("rounds the cost up like the contract (Math.mulDiv Ceil)", () => {
    expect(ceilCost(BigInt("99999999999999"), SHARE_PRICE)).toBe(BigInt(1));
    expect(ceilCost(BigInt("100000000000000"), SHARE_PRICE)).toBe(BigInt(1));
    expect(ceilCost(BigInt("199999999999999"), SHARE_PRICE)).toBe(BigInt(2));
    expect(ceilCost(BigInt(5) * E18, SHARE_PRICE)).toBe(BigInt(50_000));
    expect(ceilCost(BigInt(0), SHARE_PRICE)).toBe(BigInt(0));
  });

  it("parses whole and fractional shares into share-wei", () => {
    expect(parseShares("5")).toBe(BigInt(5) * E18);
    expect(parseShares("2.5")).toBe(BigInt("2500000000000000000"));
    expect(parseShares("0")).toBeNull();
    expect(parseShares("abc")).toBeNull();
    expect(parseShares("-1")).toBeNull();
    expect(parseShares("")).toBeNull();
  });

  it("formats USDC totals with two decimals, more only below a cent", () => {
    expect(formatUsdc(BigInt(470_000))).toBe("$0.47 USDC");
    expect(formatUsdc(BigInt(10_000))).toBe("$0.01 USDC");
    expect(formatUsdc(BigInt(10_500))).toBe("$0.0105 USDC");
    expect(formatUsdc(BigInt(0))).toBe("$0.00 USDC");
    expect(formatUsdcAmount(BigInt(1_234_560_000))).toBe("1,234.56");
  });

  it("formats claimable amounts with all six decimals", () => {
    expect(formatUsdc(BigInt(282_000), "exact")).toBe("$0.282000 USDC");
  });

  it("formats shares, supply percentages, ages, hashes and fees", () => {
    expect(formatShares(BigInt(20) * E18)).toBe("20");
    expect(formatShares(BigInt("2500000000000000000"))).toBe("2.5");
    expect(percentOfSupply(BigInt(20) * E18, BigInt(100) * E18)).toBe("20.0");
    expect(formatAge(3)).toBe("3 s ago");
    expect(formatAge(72)).toBe("1 m 12 s ago");
    expect(formatAge(3720)).toBe("1 h 02 m ago");
    expect(shortHex("0x1234567890abcdef1234567890abcdef12345678")).toBe(
      "0x1234…5678",
    );
    expect(formatMon(BigInt("15300000000000000"))).toBe("0.0153 MON");
  });
});
