// GET /api/state[?address=0x...]: free, server-cached (~1 s) snapshot of the
// Mavera contract and chain heights for every open browser (docs/04 section 2.2).
import { type NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { getState } from "@/lib/state";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const raw = request.nextUrl.searchParams.get("address");
  const address = raw && isAddress(raw) ? getAddress(raw) : undefined;
  try {
    const state = await getState(address);
    return NextResponse.json(state, { headers: NO_STORE });
  } catch (error) {
    console.error("[state] read failed:", String(error));
    return NextResponse.json(
      { error: "state_unavailable", message: String(error) },
      { status: 503, headers: NO_STORE },
    );
  }
}
