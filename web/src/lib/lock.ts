// Route lock (client side, docs/03-X402-FLOW.md section 7 and docs/04 section 4.4).
// The chain cannot force a server's payTo, so the payer refuses to sign for anyone
// but the Mavera contract, in USDC, on Monad testnet, with the exact scheme.

export interface RouteLock {
  payTo: string;
  asset: string;
  network: string;
  scheme: string;
  /** Highest amount (atomic units) the client is willing to sign for. */
  maxAmount: bigint;
}

export interface RequirementLike {
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  amount: string;
}

export type LockVerdict = { ok: true } | { ok: false; reason: string };

export const LOCK_REFUSAL_PREFIX = "route lock refused payTo ";

export function checkRequirement(
  req: RequirementLike,
  lock: RouteLock,
): LockVerdict {
  if (req.scheme !== lock.scheme) {
    return { ok: false, reason: `scheme ${req.scheme} is not ${lock.scheme}` };
  }
  if (req.network !== lock.network) {
    return {
      ok: false,
      reason: `network ${req.network} is not ${lock.network}`,
    };
  }
  if (req.asset.toLowerCase() !== lock.asset.toLowerCase()) {
    return {
      ok: false,
      reason: `asset ${req.asset} is not USDC ${lock.asset}`,
    };
  }
  if (req.payTo.toLowerCase() !== lock.payTo.toLowerCase()) {
    return { ok: false, reason: `${LOCK_REFUSAL_PREFIX}${req.payTo}` };
  }
  let amount: bigint;
  try {
    amount = BigInt(req.amount);
  } catch {
    return { ok: false, reason: `amount ${req.amount} is not an integer` };
  }
  if (amount > lock.maxAmount) {
    return {
      ok: false,
      reason: `amount ${req.amount} exceeds the agreed ${lock.maxAmount.toString()}`,
    };
  }
  return { ok: true };
}

/** The first requirement the lock accepts, or undefined. */
export function selectAllowedRequirement<T extends RequirementLike>(
  requirements: readonly T[],
  lock: RouteLock,
): T | undefined {
  return requirements.find((req) => checkRequirement(req, lock).ok);
}
