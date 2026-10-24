"use client";

import { explorerTx } from "@/lib/chain";
import { formatMon } from "@/lib/format";
import { ExternalLink } from "./ui";

/** Shared "pending -> visible -> final" line with fee and explorer link. */
export function TxLine({
  text,
  hash,
  block,
  fee,
  finalizedBlock,
  tone = "default",
}: {
  text: string;
  hash?: string;
  block?: number;
  fee?: bigint;
  finalizedBlock?: number;
  tone?: "default" | "error";
}) {
  const final =
    block !== undefined &&
    finalizedBlock !== undefined &&
    finalizedBlock >= block;
  return (
    <p
      aria-live="polite"
      className={`mt-3 text-sm ${tone === "error" ? "text-red-600 dark:text-red-400" : ""}`}
    >
      {text}
      {block !== undefined ? ` · ${final ? "final" : "visible"}` : ""}
      {hash ? (
        <>
          {" · "}
          <ExternalLink href={explorerTx(hash)}>View transaction</ExternalLink>
        </>
      ) : null}
      {fee !== undefined ? ` · Fee ${formatMon(fee)}` : ""}
    </p>
  );
}
