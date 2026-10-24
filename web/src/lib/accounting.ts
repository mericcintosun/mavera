// Exact BigInt mirror of the accounting in contracts/src/Mavera.sol
// (magnified dividend per share plus per-holder correction, M = 1e36).
// Every function is pure: it returns a new state and never mutates its input.

/** Magnifier applied to accPerShare and corrections (Mavera.sol MAGNIFIER). */
export const MAGNIFIER = BigInt("10") ** BigInt("36");

/** Immutable ledger state; balances, corrections and claimed are keyed by holder id. */
export interface Ledger {
  readonly sharePrice: bigint;
  readonly maxSupply: bigint;
  readonly creator: string;
  /** USDC units held by the contract (usdc.balanceOf(this)). */
  readonly balance: bigint;
  readonly accPerShare: bigint;
  readonly accounted: bigint;
  readonly totalDistributed: bigint;
  readonly totalSupply: bigint;
  readonly balances: Readonly<Record<string, bigint>>;
  readonly corrections: Readonly<Record<string, bigint>>;
  readonly claimed: Readonly<Record<string, bigint>>;
}

/** Constructor: mints `creatorShares` to `creator` (via _update, so sync is a no-op). */
export function createLedger({
  creatorShares,
  sharePrice,
  maxSupply,
  creator,
}: {
  creatorShares: bigint;
  sharePrice: bigint;
  maxSupply: bigint;
  creator: string;
}): Ledger {
  if (sharePrice === BigInt("0")) throw new Error("InvalidSharePrice");
  if (creatorShares === BigInt("0") || creatorShares > maxSupply)
    throw new Error("InvalidCreatorShares");
  const empty: Ledger = {
    sharePrice,
    maxSupply,
    creator,
    balance: BigInt("0"),
    accPerShare: BigInt("0"),
    accounted: BigInt("0"),
    totalDistributed: BigInt("0"),
    totalSupply: BigInt("0"),
    balances: {},
    corrections: {},
    claimed: {},
  };
  return update(empty, null, creator, creatorShares);
}

const get = (m: Readonly<Record<string, bigint>>, k: string) =>
  m[k] ?? BigInt("0");

/** pending(): USDC held but not yet synced, floored at zero. */
function pendingOf(s: Ledger): bigint {
  return s.balance > s.accounted ? s.balance - s.accounted : BigInt("0");
}

/** USDC arrives at the contract (an x402 settlement to payTo). Does not sync. */
export function pay(state: Ledger, amount: bigint): Ledger {
  if (amount < BigInt("0")) throw new Error("NegativeAmount");
  return { ...state, balance: state.balance + amount };
}

/** sync(): accPerShare += floor(pending * M / totalSupply); accounted and totalDistributed += pending. */
export function sync(state: Ledger): Ledger {
  if (state.totalSupply === BigInt("0")) return state;
  const p = pendingOf(state);
  if (p === BigInt("0")) return state;
  return {
    ...state,
    accPerShare: state.accPerShare + (p * MAGNIFIER) / state.totalSupply,
    accounted: state.accounted + p,
    totalDistributed: state.totalDistributed + p,
  };
}

/** _update(from, to, value): sync first, move balance, then adjust corrections by accPerShare * value. */
function update(
  state: Ledger,
  from: string | null,
  to: string | null,
  value: bigint,
): Ledger {
  const s = sync(state);
  const balances = { ...s.balances };
  const corrections = { ...s.corrections };
  let totalSupply = s.totalSupply;
  if (from === null) totalSupply += value;
  else {
    const fb = get(balances, from);
    if (fb < value) throw new Error("ERC20InsufficientBalance");
    balances[from] = fb - value;
  }
  if (to === null) totalSupply -= value;
  else balances[to] = get(balances, to) + value;
  const delta = s.accPerShare * value;
  if (from !== null) corrections[from] = get(corrections, from) + delta;
  if (to !== null) corrections[to] = get(corrections, to) - delta;
  return { ...s, balances, corrections, totalSupply };
}

/** Cost of `shares` share-wei: ceil(shares * sharePrice / 1e18) USDC units, paid to the creator. */
export function buyCost(state: Ledger, shares: bigint): bigint {
  const n = shares * state.sharePrice;
  const d = BigInt("10") ** BigInt("18");
  return (n + d - BigInt("1")) / d;
}

/** buy(shares): sync, cap check, mint to holder. The cost goes to the creator, not the contract balance. */
export function buy(state: Ledger, holder: string, shares: bigint): Ledger {
  const s = sync(state);
  if (shares === BigInt("0")) throw new Error("ZeroShares");
  if (s.totalSupply + shares > s.maxSupply) throw new Error("SupplyCap");
  if (buyCost(s, shares) === BigInt("0")) throw new Error("ZeroCost");
  return update(s, null, holder, shares);
}

/** transfer(from, to, shares) through _update (syncs first; entitlements do not move). */
export function transfer(
  state: Ledger,
  from: string,
  to: string,
  shares: bigint,
): Ledger {
  return update(state, from, to, shares);
}

/** _claimableAt(acc, holder): floor((acc * balance + correction) / M) - claimed, never negative. */
function claimableAt(s: Ledger, acc: bigint, holder: string): bigint {
  const entitlement =
    acc * get(s.balances, holder) + get(s.corrections, holder);
  if (entitlement <= BigInt("0")) return BigInt("0");
  const allocated = entitlement / MAGNIFIER;
  const paid = get(s.claimed, holder);
  return allocated > paid ? allocated - paid : BigInt("0");
}

/**
 * claimable(holder). `includePending` (default) mirrors the contract view, which adds
 * floor(pending * M / totalSupply) to accPerShare; false gives the stored basis.
 */
export function claimable(
  state: Ledger,
  holder: string,
  { includePending = true }: { includePending?: boolean } = {},
): bigint {
  let acc = state.accPerShare;
  const p = pendingOf(state);
  if (includePending && state.totalSupply > BigInt("0") && p > BigInt("0"))
    acc += (p * MAGNIFIER) / state.totalSupply;
  return claimableAt(state, acc, holder);
}

/** claim(): sync, pay exactly the stored claimable; throws NothingToClaim when zero. */
export function claim(
  state: Ledger,
  holder: string,
): { state: Ledger; amount: bigint } {
  const s = sync(state);
  const amount = claimableAt(s, s.accPerShare, holder);
  if (amount === BigInt("0")) throw new Error("NothingToClaim");
  return {
    amount,
    state: {
      ...s,
      claimed: { ...s.claimed, [holder]: get(s.claimed, holder) + amount },
      accounted: s.accounted - amount,
      balance: s.balance - amount,
    },
  };
}

/** Holder ids that ever held shares or claimed. */
export function holders(state: Ledger): string[] {
  return Array.from(
    new Set([...Object.keys(state.balances), ...Object.keys(state.claimed)]),
  );
}

/** Aggregates; dust = totalDistributed - sum(claimed) - sum(stored claimable). */
export function totals(state: Ledger): {
  accPerShare: bigint;
  accounted: bigint;
  totalDistributed: bigint;
  balance: bigint;
  pending: bigint;
  totalSupply: bigint;
  dust: bigint;
} {
  let sum = BigInt("0");
  for (const h of holders(state))
    sum += claimableAt(state, state.accPerShare, h) + get(state.claimed, h);
  return {
    accPerShare: state.accPerShare,
    accounted: state.accounted,
    totalDistributed: state.totalDistributed,
    balance: state.balance,
    pending: pendingOf(state),
    totalSupply: state.totalSupply,
    dust: state.totalDistributed - sum,
  };
}
