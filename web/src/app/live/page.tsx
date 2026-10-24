import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { FountainPanel } from "@/components/live/fountain-panel";
import { TxLink } from "@/components/primitives/tx-link";
import { getClientEnv, isDeployedAddress } from "@/lib/env";

export const metadata: Metadata = {
  title: "Live",
  description: "Mavera payouts on Monad testnet, live.",
  robots: { index: false },
};

/** Projector mode: the live panel alone on a dark stage, sized for 1080p and 720p. */
export default function LivePage() {
  const env = getClientEnv();
  const address = env.NEXT_PUBLIC_MAVERA_ADDRESS;
  const deployed = isDeployedAddress(address);
  return (
    <main className="relative flex min-h-dvh flex-col overflow-x-clip bg-navy">
      <header className="relative flex items-center justify-between gap-4 px-4 py-5 sm:px-10">
        <Logo size="sm" href={null} />
        <p className="tabular text-sm text-muted-foreground">
          Monad testnet · chain {env.NEXT_PUBLIC_MONAD_CHAIN_ID}
        </p>
      </header>

      <h1 className="sr-only">Mavera live payouts</h1>

      <div className="relative flex flex-1 items-center px-4 py-2 sm:px-10">
        <div className="mx-auto w-full max-w-[1600px]">
          <FountainPanel variant="projector" />
        </div>
      </div>

      <footer className="relative flex flex-wrap items-center justify-center gap-x-2 px-4 py-4 text-sm text-muted-foreground">
        <span>Contract</span>
        {deployed ? (
          <TxLink hash={address} kind="address" />
        ) : (
          <span>not deployed yet</span>
        )}
      </footer>
    </main>
  );
}
