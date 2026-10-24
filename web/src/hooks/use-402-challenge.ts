"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";

/** One entry of PaymentRequired.accepts (x402 v2, "exact" EVM scheme). */
export interface PaymentAccept {
  scheme: "exact" | string;
  /** CAIP-2, e.g. "eip155:10143". */
  network: string;
  /** Atomic USDC units as a string ("10000" = $0.01). */
  amount: string;
  asset: `0x${string}`;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  extra?: { name?: string; version?: string; [k: string]: unknown };
}

/** x402 v2 PaymentRequired, decoded from the base64 PAYMENT-REQUIRED header. */
export interface PaymentRequired {
  x402Version: number;
  error?: string;
  resource?: { url: string; description?: string; mimeType?: string };
  accepts: PaymentAccept[];
}

export type ChallengeResult = {
  httpStatus: number;
  latencyMs: number;
  challenge: PaymentRequired | null;
  rawHeader: string | null;
};

function decodeBase64Json<T>(b64: string): T {
  const bin = atob(b64.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/** Fetches the real unpaid /api/price and decodes its 402 challenge. */
export async function fetch402Challenge(): Promise<ChallengeResult> {
  const t0 = performance.now();
  const res = await fetch("/api/price", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const latencyMs = Math.round(performance.now() - t0);
  const rawHeader = res.headers.get("PAYMENT-REQUIRED");
  let challenge: PaymentRequired | null = null;
  if (rawHeader) challenge = decodeBase64Json<PaymentRequired>(rawHeader);
  else if (res.status === 402) {
    try {
      challenge = (await res.json()) as PaymentRequired;
    } catch {
      challenge = null;
    }
  }
  return { httpStatus: res.status, latencyMs, challenge, rawHeader };
}

/**
 * Runs the unpaid request on demand (or once on mount with `auto`).
 * status: idle -> loading -> ok (402 decoded) | error.
 */
export function usePaymentChallenge({ auto = false }: { auto?: boolean } = {}) {
  const m = useMutation({ mutationFn: fetch402Challenge });
  const { mutate } = m;
  useEffect(() => {
    if (auto) mutate();
  }, [auto, mutate]);
  const ok = m.isSuccess && m.data.challenge !== null;
  const status: "idle" | "loading" | "ok" | "error" = m.isPending
    ? "loading"
    : m.isError || (m.isSuccess && !ok)
      ? "error"
      : ok
        ? "ok"
        : "idle";
  return {
    run: () => mutate(),
    status,
    httpStatus: m.data?.httpStatus ?? null,
    latencyMs: m.data?.latencyMs ?? null,
    challenge: m.data?.challenge ?? null,
    accept: m.data?.challenge?.accepts?.[0] ?? null,
    rawHeader: m.data?.rawHeader ?? null,
    error:
      m.error instanceof Error
        ? m.error.message
        : m.isSuccess && !ok
          ? `Expected 402, got ${m.data.httpStatus}`
          : null,
  };
}

/** Alias of usePaymentChallenge (name requested by the section builders). */
export const use402Challenge = usePaymentChallenge;
