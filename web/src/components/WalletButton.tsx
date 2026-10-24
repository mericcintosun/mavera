"use client";

import { useConnection, useDisconnect } from "wagmi";
import { shortHex } from "@/lib/format";
import { Button } from "./ui";
import { useWalletGate } from "./wallet";

export function WalletButton() {
  const gate = useWalletGate();
  const { address } = useConnection();
  const disconnect = useDisconnect();

  if (gate.ready && address) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="tabular rounded-xl border border-line px-3 py-2 text-sm"
          title={address}
        >
          {shortHex(address)}
        </span>
        <Button variant="ghost" onClick={() => disconnect.mutate()}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button
          onClick={gate.action ?? undefined}
          disabled={gate.disabled || gate.action === null}
        >
          {gate.label}
        </Button>
        {address ? (
          <Button variant="ghost" onClick={() => disconnect.mutate()}>
            Disconnect
          </Button>
        ) : null}
      </div>
      {gate.helper ? (
        <p className="max-w-60 text-right text-xs text-muted">{gate.helper}</p>
      ) : null}
    </div>
  );
}
