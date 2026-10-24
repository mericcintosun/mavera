// GET /api/price: the one x402-paid route (docs/03-X402-FLOW.md).
// Bare RouteConfig (matches any path, so a key mismatch can never serve unpaid),
// payTo = the Mavera contract, price = X402_PRICE_ATOMIC USDC as an explicit AssetAmount.
// The x402 server is built lazily on the first request so `next build` never needs
// the env or the facilitator.
import {
  HTTPFacilitatorClient,
  type RouteConfig,
  x402ResourceServer,
} from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { withX402 } from "@x402/next";
import { after, type NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { readPriceData } from "@/lib/oracle";
import { triggerSync } from "@/lib/relayer";
import { recordServedPrice, recordSettlement } from "@/lib/state";

const NO_STORE = { "Cache-Control": "no-store" };

type PaidHandler = (request: NextRequest) => Promise<NextResponse>;

async function handler(_request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await readPriceData();
    recordServedPrice(payload);
    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (error) {
    // Status >= 400 means withX402 cancels the verified payment: the customer is not charged.
    console.error("[price] upstream read failed:", String(error));
    return NextResponse.json(
      {
        error: "upstream_unavailable",
        message: "Monad testnet RPC did not answer; nothing was charged.",
      },
      { status: 503, headers: NO_STORE },
    );
  }
}

function buildPaidHandler(): PaidHandler {
  const env = getServerEnv();
  const network = env.X402_NETWORK as Network;
  const facilitator = new HTTPFacilitatorClient({
    url: env.X402_FACILITATOR_URL,
  });
  const server = new x402ResourceServer(facilitator).register(
    network,
    new ExactEvmScheme(),
  );

  server.onAfterSettle(async (ctx) => {
    const transaction = ctx.result.transaction;
    console.log(
      JSON.stringify({
        event: "x402_settled",
        phase: ctx.phase,
        transaction,
        payer: ctx.result.payer ?? null,
        amount: ctx.requirements.amount,
        payTo: ctx.requirements.payTo,
      }),
    );
    recordSettlement(transaction);
    const reason = `settled ${transaction}`;
    try {
      // Runs after the paid response is sent; never delays the customer.
      after(() => triggerSync(reason));
    } catch (error) {
      console.warn(
        "[price] after() unavailable, syncing inline:",
        String(error),
      );
      void triggerSync(reason);
    }
  });
  server.onSettleFailure(async (ctx) => {
    console.warn(
      JSON.stringify({
        event: "x402_settle_failed",
        phase: ctx.phase,
        error: String(ctx.error),
      }),
    );
  });

  // Non-fatal startup log of what the facilitator supports.
  facilitator
    .getSupported()
    .then((supported) => {
      console.log(
        `[x402] facilitator ${env.X402_FACILITATOR_URL} /supported: ${JSON.stringify(supported).slice(0, 600)}`,
      );
    })
    .catch((error) => {
      console.warn("[x402] /supported failed (non-fatal):", String(error));
    });

  const routeConfig: RouteConfig = {
    accepts: {
      scheme: "exact",
      network,
      payTo: env.PAY_TO,
      price: {
        amount: String(env.X402_PRICE_ATOMIC),
        asset: env.USDC_ADDRESS,
        extra: { name: "USDC", version: "2" },
      },
      maxTimeoutSeconds: env.X402_MAX_TIMEOUT_SECONDS,
    },
    description: "MON/USD price from two oracles on Monad testnet",
    mimeType: "application/json",
  };

  return withX402(handler, routeConfig, server);
}

let paid: PaidHandler | undefined;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    paid ??= buildPaidHandler();
  } catch (error) {
    console.error("[price] misconfigured:", String(error));
    return NextResponse.json(
      { error: "server_misconfigured", message: String(error) },
      { status: 503, headers: NO_STORE },
    );
  }
  return paid(request);
}
