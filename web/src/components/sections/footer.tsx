import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { explorerAddress } from "@/lib/chain";
import { getClientEnv } from "@/lib/env";
import { SITE } from "@/lib/site";

const LINK =
  "group inline-flex min-h-11 items-center gap-1 rounded-md text-sm text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-cream hover:underline focus-visible:text-cream focus-visible:ring-2 focus-visible:ring-honey focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1324] active:text-cream/80";

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={LINK}>
      <span>{children}</span>
      <ArrowUpRight
        className="size-3 opacity-50 transition-[opacity,transform] duration-200 group-hover:translate-x-px group-hover:-translate-y-px group-hover:opacity-100"
        aria-hidden
      />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export function Footer() {
  const mavera = getClientEnv().NEXT_PUBLIC_MAVERA_ADDRESS;
  const links: { href: string; label: string }[] = [
    { href: SITE.links.github, label: "GitHub" },
    { href: SITE.links.docs, label: "Docs" },
    { href: SITE.links.contractSpec, label: "Contract spec" },
    { href: explorerAddress(mavera), label: "Contract on Monadscan" },
    { href: SITE.links.x402, label: "x402 guide" },
    { href: SITE.links.facilitator, label: "Facilitator" },
    { href: SITE.links.faucetUsdc, label: "Circle USDC faucet" },
    { href: SITE.links.faucetMon, label: "Monad faucet" },
  ];

  return (
    <footer className="hairline border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-10 sm:py-20">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between md:gap-12">
          <div className="max-w-sm">
            <Logo size="md" />
            <p className="mt-4 text-pretty text-sm leading-relaxed text-muted-foreground">
              {SITE.oneSentence}
            </p>
          </div>

          <nav aria-label="Project links" className="md:max-w-xl">
            <ul className="flex flex-wrap gap-x-5 sm:gap-x-6 md:justify-end">
              {links.map((l) => (
                <li key={l.label}>
                  <Ext href={l.href}>{l.label}</Ext>
                </li>
              ))}
              <li>
                <Link href="/live" className={LINK}>
                  <span>Projector view</span>
                  <ArrowUpRight
                    className="size-3 opacity-50 transition-[opacity,transform] duration-200 group-hover:translate-x-px group-hover:-translate-y-px group-hover:opacity-100"
                    aria-hidden
                  />
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="hairline mt-12 flex flex-col gap-2 border-t pt-6 text-sm text-muted-foreground sm:flex-row sm:items-baseline sm:justify-between">
          <p>Built at {SITE.event}</p>
          <p className="max-w-md text-pretty text-xs leading-relaxed text-muted-foreground/70 sm:text-right">
            {SITE.disclaimer}
          </p>
        </div>
      </div>
    </footer>
  );
}
