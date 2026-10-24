// Server-only: the data behind the cent (docs/03-X402-FLOW.md section 10).
// One Multicall3 eth_call for the oracles, one for the staking precompile, plus
// the latest and finalized block headers. A failing source never fails the route.
import { type Address, type Hex, keccak256, stringToHex } from "viem";
import { pythAbi, stakingAbi, storkAbi } from "./abi/oracles";
import { asAddress, getPublicClient } from "./clients";
import { getServerEnv } from "./env";
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
import type { PricePayload, PriceSource, SourceName } from "./types";

/** keccak256("MONUSD") = 0xa4f6b07ae0c89e3f3cc03c1badcc3e9adffdf7206bafcd56d142979800887385 */
export const STORK_MON_USD_ID: Hex = keccak256(stringToHex("MONUSD"));
export const STAKING_PRECOMPILE: Address =
  "0x0000000000000000000000000000000000001000";

type Client = ReturnType<typeof getPublicClient>;

interface RawSource {
  name: SourceName;
  contract: string;
  scaled: bigint | null;
  publishedAt: number | null;
  validForS: number;
  error: string | null;
}

function firstLine(error: unknown): string {
  const message =
    error && typeof error === "object" && "shortMessage" in error
      ? String((error as { shortMessage: unknown }).shortMessage)
      : String(error);
  return message.split("\n")[0].slice(0, 160);
}

async function readOracleRaw(client: Client): Promise<RawSource[]> {
  const env = getServerEnv();
  try {
    const [pyth, stork] = await client.multicall({
      allowFailure: true,
      multicallAddress: asAddress(env.MULTICALL3_ADDRESS),
      contracts: [
        {
          address: asAddress(env.PYTH_ADDRESS),
          abi: pythAbi,
          functionName: "getPriceUnsafe",
          args: [env.PYTH_MON_USD_FEED_ID as Hex],
        },
        {
          address: asAddress(env.STORK_ADDRESS),
          abi: storkAbi,
          functionName: "getTemporalNumericValueUnsafeV1",
          args: [STORK_MON_USD_ID],
        },
      ],
    });
    const pythSource: RawSource =
      pyth.status === "success"
        ? {
            name: "Pyth",
            contract: env.PYTH_ADDRESS,
            scaled: scaledFromPyth(pyth.result.price, pyth.result.expo),
            publishedAt: Number(pyth.result.publishTime),
            validForS: PYTH_VALID_FOR_S,
            error: null,
          }
        : unavailable("Pyth", env.PYTH_ADDRESS, PYTH_VALID_FOR_S, pyth.error);
    const storkSource: RawSource =
      stork.status === "success"
        ? {
            name: "Stork",
            contract: env.STORK_ADDRESS,
            scaled: scaledFromStork(stork.result.quantizedValue),
            publishedAt: storkTimestampSeconds(stork.result.timestampNs),
            validForS: STORK_VALID_FOR_S,
            error: null,
          }
        : unavailable(
            "Stork",
            env.STORK_ADDRESS,
            STORK_VALID_FOR_S,
            stork.error,
          );
    return [pythSource, storkSource];
  } catch (error) {
    // The whole multicall failed (RPC hiccup): both sources unavailable, route still answers.
    console.warn("[oracle] multicall failed:", firstLine(error));
    return [
      unavailable("Pyth", env.PYTH_ADDRESS, PYTH_VALID_FOR_S, error),
      unavailable("Stork", env.STORK_ADDRESS, STORK_VALID_FOR_S, error),
    ];
  }
}

function unavailable(
  name: SourceName,
  contract: string,
  validForS: number,
  error: unknown,
): RawSource {
  console.warn(`[oracle] ${name} unavailable:`, firstLine(error));
  return {
    name,
    contract,
    scaled: null,
    publishedAt: null,
    validForS,
    error: "source unavailable",
  };
}

interface Heartbeat {
  epoch: number | null;
  proposerValId: number | null;
  validatorCount: number | null;
}

async function readHeartbeat(client: Client): Promise<Heartbeat> {
  const env = getServerEnv();
  try {
    const [epoch, proposer, validators] = await client.multicall({
      allowFailure: true,
      multicallAddress: asAddress(env.MULTICALL3_ADDRESS),
      contracts: [
        {
          address: STAKING_PRECOMPILE,
          abi: stakingAbi,
          functionName: "getEpoch",
        },
        {
          address: STAKING_PRECOMPILE,
          abi: stakingAbi,
          functionName: "getProposerValId",
        },
        {
          address: STAKING_PRECOMPILE,
          abi: stakingAbi,
          functionName: "getConsensusValidatorSet",
          args: [0],
        },
      ],
    });
    return {
      epoch: epoch.status === "success" ? Number(epoch.result[0]) : null,
      proposerValId:
        proposer.status === "success" ? Number(proposer.result) : null,
      validatorCount:
        validators.status === "success" ? validators.result[2].length : null,
    };
  } catch (error) {
    console.warn("[oracle] heartbeat multicall failed:", firstLine(error));
    return { epoch: null, proposerValId: null, validatorCount: null };
  }
}

async function readFinalizedNumber(
  client: Client,
  fallback: bigint,
): Promise<bigint> {
  try {
    const block = await client.getBlock({ blockTag: "finalized" });
    return block.number;
  } catch (error) {
    console.warn("[oracle] finalized block unavailable:", firstLine(error));
    return fallback;
  }
}

/** Reads everything GET /api/price serves. Throws only when the latest block cannot be read. */
export async function readPriceData(): Promise<PricePayload> {
  const env = getServerEnv();
  const client = getPublicClient();
  const started = performance.now();
  const oracleMode = env.DATA_MODE === "oracle";

  const [latest, heartbeat, raw] = await Promise.all([
    client.getBlock({ blockTag: "latest" }),
    readHeartbeat(client),
    oracleMode ? readOracleRaw(client) : Promise.resolve<RawSource[]>([]),
  ]);
  const finalized = await readFinalizedNumber(client, latest.number);
  const blockTimestamp = Number(latest.timestamp);

  const sources: PriceSource[] = raw.map((source) => {
    const ageS =
      source.publishedAt === null
        ? null
        : sourceAge(blockTimestamp, source.publishedAt);
    return {
      name: source.name,
      contract: source.contract,
      price: source.scaled === null ? null : formatScaled(source.scaled),
      published_at: source.publishedAt,
      age_s: ageS,
      valid_for_s: source.validForS,
      valid:
        source.scaled !== null &&
        ageS !== null &&
        isSourceValid(ageS, source.validForS),
      error: source.error,
    };
  });

  const validValues = raw
    .filter((source, index) => sources[index].valid && source.scaled !== null)
    .map((source) => source.scaled as bigint);
  const median = medianScaled(validValues);
  const spread =
    validValues.length >= 2 ? spreadBps(validValues[0], validValues[1]) : null;

  return {
    pair: "MON/USD",
    mode: oracleMode ? "oracle" : "heartbeat",
    price_usd: median === null ? null : formatScaled(median),
    sources,
    spread_bps: spread,
    block_number: Number(latest.number),
    block_timestamp: blockTimestamp,
    finalized_block: Number(finalized),
    epoch: heartbeat.epoch,
    proposer_val_id: heartbeat.proposerValId,
    validator_count: heartbeat.validatorCount,
    rpc_latency_ms: Math.round(performance.now() - started),
    served_at: new Date().toISOString(),
  };
}
