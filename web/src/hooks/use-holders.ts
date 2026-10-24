"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useConnection, useReadContracts } from "wagmi";
import type { HolderWho } from "@/components/primitives/holder-avatar";
import { maveraAbi } from "@/lib/abi/mavera";
import { getClientEnv } from "@/lib/env";
import { DEMO_HOLDERS } from "@/lib/site";

export type HolderRow = {
  key: string;
  label: string;
  who: HolderWho;
  address: `0x${string}`;
  shares: bigint;
  /** Share of supply in basis points (0-10,000). */
  bps: number;
  claimable: bigint;
  claimed: bigint | null;
  isYou: boolean;
};

const ZERO = BigInt(0);

/**
 * Live holder table from one multicall (refetch every 4 s): totalSupply plus
 * balanceOf / claimable / claimed for DEMO_HOLDERS and the connected wallet.
 */
export function useHolders() {
  const { address: me } = useConnection();
  const env = getClientEnv();
  const contract = env.NEXT_PUBLIC_MAVERA_ADDRESS as `0x${string}`;
  const listed: {
    key: string;
    label: string;
    who: HolderWho;
    address: `0x${string}`;
  }[] = DEMO_HOLDERS.map((h) => ({ ...h }));
  const meListed =
    me && listed.some((h) => h.address.toLowerCase() === me.toLowerCase());
  if (me && !meListed)
    listed.push({ key: "you", label: "You", who: "you", address: me });

  const base = { address: contract, abi: maveraAbi } as const;
  const contracts = [
    { ...base, functionName: "totalSupply" } as const,
    ...listed.flatMap(
      (h) =>
        [
          { ...base, functionName: "balanceOf", args: [h.address] },
          { ...base, functionName: "claimable", args: [h.address] },
          { ...base, functionName: "claimed", args: [h.address] },
        ] as const,
    ),
  ];
  const q = useReadContracts({
    contracts,
    allowFailure: true,
    query: { refetchInterval: 4000, placeholderData: keepPreviousData },
  });
  const res = q.data;
  const big = (i: number): bigint | null => {
    const r = res?.[i];
    return r && r.status === "success" ? (r.result as bigint) : null;
  };
  const totalSupply = big(0) ?? ZERO;
  let listedSum = ZERO;
  const rows: HolderRow[] = listed.map((h, j) => {
    const shares = big(1 + j * 3) ?? ZERO;
    listedSum += shares;
    return {
      ...h,
      shares,
      bps:
        totalSupply > ZERO ? Number((shares * BigInt(10000)) / totalSupply) : 0,
      claimable: big(2 + j * 3) ?? ZERO,
      claimed: big(3 + j * 3),
      isYou: !!me && h.address.toLowerCase() === me.toLowerCase(),
    };
  });
  const others = totalSupply > listedSum ? totalSupply - listedSum : ZERO;
  return { rows, totalSupply, others, isLoading: q.isLoading };
}
