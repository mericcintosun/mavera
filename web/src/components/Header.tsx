"use client";

import { useConnection } from "wagmi";
import { explorerAddress } from "@/lib/chain";
import { getClientEnv, isDeployedAddress } from "@/lib/env";
import {
  formatShares,
  formatUsdcAmount,
  percentOfSupply,
  shortHex,
  toBig,
  ZERO,
} from "@/lib/format";
import { ExternalLink } from "./ui";
import { useStatePoll } from "./useStatePoll";
import { WalletButton } from "./WalletButton";

export function Header() {
  const { data: state } = useStatePoll();
  const { address } = useConnection();
  const env = getClientEnv();
  const configured = isDeployedAddress(env.NEXT_PUBLIC_MAVERA_ADDRESS);
  const notDeployed = !configured || (state !== undefined && !state.deployed);
  const shares = toBig(state?.me?.shares);
  const total = toBig(state?.total_supply);

  return (
    <header className="pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Mavera</h1>
          <p className="mt-1 text-sm text-muted">
            A paid API that pays its share holders on every call.
          </p>
        </div>
        <WalletButton />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium">
          Monad Testnet · 10143
        </span>
        {state?.deployed ? (
          <span className="tabular text-muted">
            {state.token_name} ({state.token_symbol}) · Share price{" "}
            {formatUsdcAmount(toBig(state.share_price))} USDC · Supply{" "}
            {formatShares(total)} / {formatShares(toBig(state.max_supply))}{" "}
            shares · Holders —
          </span>
        ) : null}
        {configured ? (
          <ExternalLink
            href={explorerAddress(env.NEXT_PUBLIC_MAVERA_ADDRESS)}
            className="text-xs text-muted"
          >
            Contract {shortHex(env.NEXT_PUBLIC_MAVERA_ADDRESS)}
          </ExternalLink>
        ) : null}
      </div>

      {notDeployed ? (
        <p className="mt-3 rounded-xl border border-line bg-card px-3 py-2 text-sm">
          Mavera is not deployed yet. Set NEXT_PUBLIC_MAVERA_ADDRESS and
          redeploy.
        </p>
      ) : null}

      {address && shares > ZERO ? (
        <p className="mt-3 text-sm">
          You hold{" "}
          <span className="tabular font-semibold">{formatShares(shares)}</span>{" "}
          shares ({percentOfSupply(shares, total)} % of supply)
        </p>
      ) : null}
    </header>
  );
}
