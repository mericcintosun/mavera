import { ArrowUpRight } from "lucide-react";
import { explorerAddress, explorerTx } from "@/lib/chain";
import { shortHex } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Shortened mono link to a tx or address on testnet.monadscan.com. */
export function TxLink({
  hash,
  kind = "tx",
  className,
}: {
  hash: string;
  kind?: "tx" | "address";
  className?: string;
}) {
  return (
    <a
      href={kind === "tx" ? explorerTx(hash) : explorerAddress(hash)}
      target="_blank"
      rel="noreferrer"
      title={hash}
      className={cn(
        "inline-flex items-center gap-1 rounded font-mono text-[12.5px] text-sky underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-honey",
        className,
      )}
    >
      {shortHex(hash)}
      <ArrowUpRight aria-hidden="true" className="size-3" />
      <span className="sr-only">(opens Monadscan)</span>
    </a>
  );
}
