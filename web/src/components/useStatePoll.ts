"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useConnection } from "wagmi";
import type { StateResponse } from "@/lib/types";

export const STATE_QUERY_KEY = "state";

/** Every component shares one GET /api/state poll (2 s, paused in background tabs). */
export function useStatePoll() {
  const { address } = useConnection();
  return useQuery({
    queryKey: [STATE_QUERY_KEY, address ?? null],
    queryFn: async ({ signal }): Promise<StateResponse> => {
      const url = address ? `/api/state?address=${address}` : "/api/state";
      const res = await fetch(url, { cache: "no-store", signal });
      if (!res.ok) {
        throw new Error(`GET /api/state failed (${res.status})`);
      }
      return (await res.json()) as StateResponse;
    },
    refetchInterval: 2000,
    placeholderData: keepPreviousData,
    staleTime: 1000,
  });
}

/** A clock that ticks every `intervalMs` so ages can be extrapolated between polls. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
