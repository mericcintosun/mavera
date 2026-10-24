"use client";

import { useEffect, useRef, useState } from "react";
import { toBig } from "@/lib/format";
import type { StateResponse } from "@/lib/types";

export interface RevenueEvent {
  id: number;
  /** USDC atomic units added to revenue_total since the previous poll. */
  amount: bigint;
  /** Client clock (ms) when the increase was observed. */
  at: number;
}

const MAX_EVENTS = 8;

/**
 * Turns the 2 s state poll into discrete revenue events: one per observed
 * increase of `revenue_total`. The first poll after an error only re-baselines
 * (so a reconnect never fires a burst) and time fields are never looked at.
 */
export function useRevenueEvents(
  state: StateResponse | undefined,
  isError: boolean,
): { events: RevenueEvent[]; latestId: number | null } {
  const [events, setEvents] = useState<RevenueEvent[]>([]);
  const prevRef = useRef<bigint | null>(null);
  const hadErrorRef = useRef(false);
  const seqRef = useRef(0);
  const revenue = toBig(state?.revenue_total);
  const loaded = state !== undefined;

  useEffect(() => {
    if (isError) {
      hadErrorRef.current = true;
      return;
    }
    if (!loaded) {
      return;
    }
    const prev = prevRef.current;
    prevRef.current = revenue;
    if (hadErrorRef.current) {
      hadErrorRef.current = false;
      return;
    }
    if (prev === null || revenue <= prev) {
      return;
    }
    seqRef.current += 1;
    const event: RevenueEvent = {
      id: seqRef.current,
      amount: revenue - prev,
      at: Date.now(),
    };
    setEvents((list) => [event, ...list].slice(0, MAX_EVENTS));
  }, [loaded, revenue, isError]);

  return { events, latestId: events[0]?.id ?? null };
}
