import { describe, expect, it } from "vitest";
import {
  buy,
  claim,
  claimable,
  createLedger,
  holders,
  type Ledger,
  pay,
  sync,
  totals,
  transfer,
} from "./accounting";

const E18 = BigInt("10") ** BigInt("18");

function invariant(s: Ledger) {
  const t = totals(s);
  let sum = BigInt("0");
  for (const h of holders(s))
    sum +=
      claimable(s, h, { includePending: false }) +
      (s.claimed[h] ?? BigInt("0"));
  expect(sum + t.dust).toBe(t.totalDistributed);
  expect(t.dust >= BigInt("0")).toBe(true);
}

const stored = (s: Ledger, h: string) =>
  claimable(s, h, { includePending: false });

describe("accounting mirrors docs/02 section 8 worked example", () => {
  it("replays every step", () => {
    let s = createLedger({
      creatorShares: BigInt("60") * E18,
      sharePrice: BigInt("10000"),
      maxSupply: BigInt("1000") * E18,
      creator: "creator",
    });
    invariant(s);
    s = buy(s, "buyer", BigInt("40") * E18);
    invariant(s);
    s = pay(s, BigInt("10000"));
    expect(claimable(s, "creator")).toBe(BigInt("6000"));
    expect(claimable(s, "buyer")).toBe(BigInt("4000"));
    invariant(s);
    s = sync(s);
    expect(s.accPerShare).toBe(BigInt("100000000000000000000"));
    invariant(s);
    s = pay(s, BigInt("20000"));
    invariant(s);
    s = sync(s);
    invariant(s);
    s = transfer(s, "buyer", "third", BigInt("20") * E18);
    expect(s.corrections.buyer).toBe(
      BigInt("6") * BigInt("10") ** BigInt("39"),
    );
    expect(stored(s, "creator")).toBe(BigInt("18000"));
    expect(stored(s, "buyer")).toBe(BigInt("12000"));
    expect(stored(s, "third")).toBe(BigInt("0"));
    invariant(s);
    s = pay(s, BigInt("5000"));
    invariant(s);
    s = sync(s);
    invariant(s);
    const r = claim(s, "buyer");
    expect(r.amount).toBe(BigInt("13000"));
    s = r.state;
    invariant(s);
    s = pay(s, BigInt("7"));
    invariant(s);
    s = sync(s);
    invariant(s);
    expect(stored(s, "creator")).toBe(BigInt("21004"));
    expect(stored(s, "buyer")).toBe(BigInt("1"));
    expect(stored(s, "third")).toBe(BigInt("1001"));
    const t = totals(s);
    expect(t.accPerShare).toBe(BigInt("350070000000000000000"));
    expect(t.accounted).toBe(BigInt("22007"));
    expect(t.totalDistributed).toBe(BigInt("35007"));
    expect(t.dust).toBe(BigInt("1"));
  });
});
