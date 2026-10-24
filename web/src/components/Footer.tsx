"use client";

import { explorerAddress, explorerTx, FACILITATOR_SIGNER } from "@/lib/chain";
import { getClientEnv, isDeployedAddress } from "@/lib/env";
import { ExternalLink } from "./ui";
import { useStatePoll } from "./useStatePoll";

export function Footer() {
  const { data: state } = useStatePoll();
  const env = getClientEnv();
  const configured = isDeployedAddress(env.NEXT_PUBLIC_MAVERA_ADDRESS);

  return (
    <footer className="mt-4 space-y-4 border-t border-line pt-6 text-xs text-muted">
      <nav
        aria-label="Explorer links"
        className="flex flex-wrap gap-x-4 gap-y-1"
      >
        {configured ? (
          <ExternalLink href={explorerAddress(env.NEXT_PUBLIC_MAVERA_ADDRESS)}>
            Mavera contract
          </ExternalLink>
        ) : null}
        <ExternalLink href={explorerAddress(env.NEXT_PUBLIC_USDC_ADDRESS)}>
          USDC (Circle, testnet)
        </ExternalLink>
        <ExternalLink href={explorerAddress(FACILITATOR_SIGNER)}>
          Facilitator signer (pays the gas)
        </ExternalLink>
        {state?.last_sync_tx ? (
          <ExternalLink href={explorerTx(state.last_sync_tx)}>
            Last sync transaction
          </ExternalLink>
        ) : (
          <span>Last sync transaction — none yet</span>
        )}
      </nav>
      <p>
        Testnet proof of concept with test USDC. Not an offer of securities. A
        production deployment would require a KYC allow-list and a licensed
        issuance wrapper in the relevant jurisdiction.
      </p>
      <p>
        Prior art: ERC-2222 Funds Distribution Token (Johannes Pfeffer, atpar,
        with Roger Wu), the EIP-1726 dividend-token draft (GitHub issue
        ethereum/EIPs#1726), x402commit (pilot on Base), Bondrail (Monad
        testnet). Mavera: one permissionless contract, payTo locked to the
        contract, per-call distribution.
      </p>
      <p>
        Built at Monad Blitz Ankara v4, 24 Oct 2026. Product code from 10:45.
        MIT licence.
      </p>
    </footer>
  );
}
