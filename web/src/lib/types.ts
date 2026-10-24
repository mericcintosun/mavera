// JSON shapes shared by the route handlers and the client components.
// bigint values travel as decimal strings.

export type SourceName = "Pyth" | "Stork";

export interface PriceSource {
  name: SourceName;
  contract: string;
  price: string | null;
  published_at: number | null;
  age_s: number | null;
  valid_for_s: number;
  valid: boolean;
  error: string | null;
}

export interface PricePayload {
  pair: "MON/USD";
  mode: "oracle" | "heartbeat";
  price_usd: string | null;
  sources: PriceSource[];
  spread_bps: number | null;
  block_number: number;
  block_timestamp: number;
  finalized_block: number;
  epoch: number | null;
  proposer_val_id: number | null;
  validator_count: number | null;
  rpc_latency_ms: number;
  served_at: string;
}

export interface MeState {
  address: string;
  shares: string;
  claimable: string;
  usdc_balance: string;
  usdc_allowance: string;
}

export interface LastPrice {
  price_usd: string | null;
  mode: "oracle" | "heartbeat";
  served_at: string;
  block_number: number;
}

export interface StateResponse {
  fetched_age_ms: number;
  chain_id: number;
  block_number: number;
  block_timestamp: number;
  finalized_block: number;
  deployed: boolean;
  mavera_address: string;
  usdc_address: string;
  price_atomic: string;
  token_name: string | null;
  token_symbol: string | null;
  share_price: string | null;
  total_supply: string | null;
  max_supply: string | null;
  creator: string | null;
  pay_to: string | null;
  endpoint: string | null;
  /** Not available on-chain (no holderCount view); always null. */
  holders: null;
  total_distributed: string | null;
  pending: string | null;
  revenue_total: string | null;
  paid_calls: number | null;
  last_call_age_s: number | null;
  last_sync_tx: string | null;
  last_sync_block: number | null;
  last_settlement_tx: string | null;
  last_price: LastPrice | null;
  me: MeState | null;
}
