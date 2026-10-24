"use client";

import { Reveal } from "@/components/motion/reveal";
import { DevicePanel } from "@/components/primitives/device-panel";
import { Section } from "@/components/sections/section";
import { PayoutCost } from "@/components/why/payout-cost";
import { PayoutRace } from "@/components/why/payout-race";

const REASONS = [
  {
    lead: "The payer is a machine.",
    body: "Agents and scripts pay per call with one signature. No account, no API key, no card on file. They cannot open a Stripe account, and they do not need one.",
  },
  {
    lead: "The payee is the contract.",
    body: "With Stripe the operator receives the money and promises to pay out. Here payTo is the share contract itself, so the payment and the dividend are one atomic flow.",
  },
  {
    lead: "The claim is a bearer token.",
    body: "Shares are a plain ERC-20 anyone can buy at 1-cent granularity and move to any wallet. Connect splits are custodial, revocable and jurisdiction-gated.",
  },
] as const;

export function WhyMonad() {
  return (
    <Section
      id="why"
      title="Sub-cent payouts need a sub-second chain."
      description="Splitting one cent on every call only works where blocks are fast and a distribution costs a fraction of that cent."
    >
      <Reveal>
        <DevicePanel glow="none">
          <div className="p-5 sm:p-10">
            <PayoutRace />
          </div>
          <div className="mx-5 h-px bg-white/[0.08] sm:mx-10" />
          <div className="p-5 sm:p-10">
            <PayoutCost />
          </div>
          <p className="border-t border-white/[0.06] px-5 py-4 text-xs leading-relaxed text-muted-foreground/80 sm:px-10">
            Monad figures from docs.monad.xyz: blocks visible in about 300 ms,
            final at about 600 ms; gas at the 100 MON-gwei minimum base fee,
            which can rise under load. The 12-second chain is the Ethereum row
            of the same docs comparison.
          </p>
        </DevicePanel>
      </Reveal>

      <Reveal className="mt-20 sm:mt-28">
        <h3 className="display text-3xl text-cream sm:text-4xl">
          Why a chain, not Stripe.
        </h3>
        <p className="mt-3 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
          The chain is the cap table and the escrow, not the payment rail.
        </p>
        <div className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-12">
          {REASONS.map((r) => (
            <p
              key={r.lead}
              className="text-pretty text-base leading-relaxed text-muted-foreground"
            >
              <span className="display mb-2 block text-xl text-cream">
                {r.lead}
              </span>
              {r.body}
            </p>
          ))}
        </div>
        <p className="mt-12 text-sm text-muted-foreground/70">
          Testnet proof of concept. Not an offer of securities.
        </p>
      </Reveal>
    </Section>
  );
}
