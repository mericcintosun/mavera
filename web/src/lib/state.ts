// Server-only poller behind GET /api/state (docs/04-FRONTEND.md section 2).
// One shared snapshot per instance, refreshed at most once per second, plus a
// per-address snapshot (also ~1 s) for connected wallets. Browsers never touch the RPC.
import { type Address, getAbiItem } from "viem";
import { erc20Abi } from "./abi/erc20";
import { maveraAbi } from "./abi/mavera";
import { asAddress, getPublicClient } from "./clients";
import { getServerEnv, isDeployedAddress } from "./env";
import type { LastPrice, MeState, PricePayload, StateResponse } from "./types";

const SHARED_TTL_MS = 1000;
const ME_TTL_MS = 1000;
/** eth_getLogs on the public RPC allows toBlock - fromBlock <= 100. */
const LOG_WINDOW = BigInt(99);
const ZERO = BigInt(0);

type SharedData = Omit<StateResponse, "fetched_age_ms" | "me">;

interface SharedSnapshot {
  at: number;
  data: SharedData;
}

let shared: SharedSnapshot | undefined;
let sharedInflight: Promise<SharedSnapshot> | undefined;
const meCache = new Map<
  string,
  { at: number; data: MeState; inflight?: Promise<MeState> }
>();

// Instance memory (null after a cold start, by design).
let lastRevenueTotal: bigint | undefined;
let lastCallAt: number | undefined;
let lastSyncTx: string | null = null;
let lastSyncBlock: number | null = null;
let lastSettlementTx: string | null = null;
let lastPrice: LastPrice | null = null;

const syncedEvent = getAbiItem({ abi: maveraAbi, name: "Synced" });

/** Called by the x402 onAfterSettle hook. */
export function recordSettlement(transaction: string): void {
  lastSettlementTx = transaction;
  lastCallAt = Date.now();
}

/** Called by the relayer when its sync() transaction lands. */
export function recordSyncTx(transaction: string, block?: number): void {
  lastSyncTx = transaction;
  if (block !== undefined) {
    lastSyncBlock = block;
  }
}

/** Free preview of the last price the paid route served (for the UI only). */
export function recordServedPrice(payload: PricePayload): void {
  lastPrice = {
    price_usd: payload.price_usd,
    mode: payload.mode,
    served_at: payload.served_at,
    block_number: payload.block_number,
  };
}

export async function getState(address?: Address): Promise<StateResponse> {
  const [snapshot, me] = await Promise.all([
    getShared(),
    address ? getMe(address) : Promise.resolve(null),
  ]);
  return { ...snapshot.data, fetched_age_ms: Date.now() - snapshot.at, me };
}

function getShared(): Promise<SharedSnapshot> {
  if (shared && Date.now() - shared.at < SHARED_TTL_MS) {
    return Promise.resolve(shared);
  }
  if (!sharedInflight) {
    sharedInflight = refreshShared()
      .then((snapshot) => {
        shared = snapshot;
        return snapshot;
      })
      .finally(() => {
        sharedInflight = undefined;
      });
  }
  return sharedInflight;
}

async function refreshShared(): Promise<SharedSnapshot> {
  const env = getServerEnv();
  const client = getPublicClient();
  const mavera = asAddress(env.MAVERA_ADDRESS);
  const configured = isDeployedAddress(env.MAVERA_ADDRESS);

  const [latest, finalizedNumber, reads] = await Promise.all([
    client.getBlock({ blockTag: "latest" }),
    client
      .getBlock({ blockTag: "finalized" })
      .then((block) => block.number)
      .catch(() => null),
    configured
      ? client.multicall({
          allowFailure: true,
          multicallAddress: asAddress(env.MULTICALL3_ADDRESS),
          contracts: [
            { address: mavera, abi: maveraAbi, functionName: "name" },
            { address: mavera, abi: maveraAbi, functionName: "symbol" },
            { address: mavera, abi: maveraAbi, functionName: "sharePrice" },
            { address: mavera, abi: maveraAbi, functionName: "maxSupply" },
            { address: mavera, abi: maveraAbi, functionName: "creator" },
            { address: mavera, abi: maveraAbi, functionName: "payTo" },
            { address: mavera, abi: maveraAbi, functionName: "endpoint" },
            { address: mavera, abi: maveraAbi, functionName: "totalSupply" },
            {
              address: mavera,
              abi: maveraAbi,
              functionName: "totalDistributed",
            },
            { address: mavera, abi: maveraAbi, functionName: "pending" },
          ],
        })
      : Promise.resolve(null),
  ]);

  const at = Date.now();
  const base: SharedData = {
    chain_id: env.MONAD_CHAIN_ID,
    block_number: Number(latest.number),
    block_timestamp: Number(latest.timestamp),
    finalized_block: Number(finalizedNumber ?? latest.number),
    deployed: false,
    mavera_address: env.MAVERA_ADDRESS,
    usdc_address: env.USDC_ADDRESS,
    price_atomic: String(env.X402_PRICE_ATOMIC),
    token_name: null,
    token_symbol: null,
    share_price: null,
    total_supply: null,
    max_supply: null,
    creator: null,
    pay_to: null,
    endpoint: null,
    holders: null,
    total_distributed: null,
    pending: null,
    revenue_total: null,
    paid_calls: null,
    last_call_age_s: null,
    last_sync_tx: lastSyncTx,
    last_sync_block: lastSyncBlock,
    last_settlement_tx: lastSettlementTx,
    last_price: lastPrice,
  };

  if (!reads || reads.some((read) => read.status === "failure")) {
    if (reads) {
      console.warn(
        "[state] Mavera reads failed; treating as not deployed:",
        reads.find((read) => read.status === "failure")?.error,
      );
    }
    return { at, data: base };
  }

  const [
    name,
    symbol,
    sharePrice,
    maxSupply,
    creator,
    payTo,
    endpoint,
    totalSupply,
    totalDistributed,
    pending,
  ] = reads.map((read) => read.result);

  const distributed = totalDistributed as bigint;
  const pendingAmount = pending as bigint;
  const revenueTotal = distributed + pendingAmount;
  if (lastRevenueTotal !== undefined && revenueTotal > lastRevenueTotal) {
    lastCallAt = at;
  }
  lastRevenueTotal = revenueTotal;

  await scanSyncedLogs(client, mavera, latest.number);

  const data: SharedData = {
    ...base,
    deployed: true,
    token_name: name as string,
    token_symbol: symbol as string,
    share_price: (sharePrice as bigint).toString(),
    total_supply: (totalSupply as bigint).toString(),
    max_supply: (maxSupply as bigint).toString(),
    creator: creator as string,
    pay_to: payTo as string,
    endpoint: endpoint as string,
    total_distributed: distributed.toString(),
    pending: pendingAmount.toString(),
    revenue_total: revenueTotal.toString(),
    paid_calls: Number(revenueTotal / BigInt(env.X402_PRICE_ATOMIC)),
    last_call_age_s:
      lastCallAt === undefined ? null : Math.floor((at - lastCallAt) / 1000),
    last_sync_tx: lastSyncTx,
    last_sync_block: lastSyncBlock,
    last_settlement_tx: lastSettlementTx,
    last_price: lastPrice,
  };
  return { at, data };
}

/** Bounded scan (<= 100 blocks) for the newest Synced event; remembered across polls. */
async function scanSyncedLogs(
  client: ReturnType<typeof getPublicClient>,
  mavera: Address,
  latestBlock: bigint,
): Promise<void> {
  try {
    const fromBlock =
      latestBlock > LOG_WINDOW ? latestBlock - LOG_WINDOW : ZERO;
    const logs = await client.getLogs({
      address: mavera,
      event: syncedEvent,
      fromBlock,
      toBlock: latestBlock,
    });
    const newest = logs.at(-1);
    if (newest?.transactionHash && newest.blockNumber !== null) {
      const block = Number(newest.blockNumber);
      if (lastSyncBlock === null || block >= lastSyncBlock) {
        lastSyncTx = newest.transactionHash;
        lastSyncBlock = block;
      }
    }
  } catch (error) {
    console.warn("[state] Synced log scan failed (non-fatal):", String(error));
  }
}

function getMe(address: Address): Promise<MeState> {
  const key = address.toLowerCase();
  const cached = meCache.get(key);
  if (cached && Date.now() - cached.at < ME_TTL_MS) {
    return Promise.resolve(cached.data);
  }
  if (cached?.inflight) {
    return cached.inflight;
  }
  const inflight = refreshMe(address)
    .then((data) => {
      meCache.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      const entry = meCache.get(key);
      if (entry) {
        entry.inflight = undefined;
      }
    });
  meCache.set(key, {
    at: cached?.at ?? 0,
    data: cached?.data ?? emptyMe(address),
    inflight,
  });
  return inflight;
}

function emptyMe(address: Address): MeState {
  return {
    address,
    shares: "0",
    claimable: "0",
    usdc_balance: "0",
    usdc_allowance: "0",
  };
}

async function refreshMe(address: Address): Promise<MeState> {
  const env = getServerEnv();
  const client = getPublicClient();
  const mavera = asAddress(env.MAVERA_ADDRESS);
  const usdc = asAddress(env.USDC_ADDRESS);
  const [shares, claimable, usdcBalance, usdcAllowance] =
    await client.multicall({
      allowFailure: true,
      multicallAddress: asAddress(env.MULTICALL3_ADDRESS),
      contracts: [
        {
          address: mavera,
          abi: maveraAbi,
          functionName: "balanceOf",
          args: [address],
        },
        {
          address: mavera,
          abi: maveraAbi,
          functionName: "claimable",
          args: [address],
        },
        {
          address: usdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        },
        {
          address: usdc,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, mavera],
        },
      ],
    });
  const str = (read: { status: string; result?: unknown }): string =>
    read.status === "success" ? String(read.result) : "0";
  return {
    address,
    shares: str(shares),
    claimable: str(claimable),
    usdc_balance: str(usdcBalance),
    usdc_allowance: str(usdcAllowance),
  };
}
