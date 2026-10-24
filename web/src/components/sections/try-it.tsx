"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useRef, useState } from "react";
import { BuyForm } from "@/components/actions/buy-card";
import { CallForm } from "@/components/actions/call-card";
import { ClaimForm } from "@/components/actions/claim-card";
import { EASE_OUT, Reveal } from "@/components/motion/reveal";
import { CopyButton } from "@/components/primitives/copy-button";
import { DevicePanel } from "@/components/primitives/device-panel";
import { Section } from "@/components/sections/section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type TabId = "call" | "buy" | "claim";

const TABS: { id: TabId; label: string }[] = [
  { id: "call", label: "Call" },
  { id: "buy", label: "Buy" },
  { id: "claim", label: "Claim" },
];

const DEFAULT_TAB: TabId = "call";

const API_BASE = "https://mavera-ruby.vercel.app";

const SNIPPETS: { id: string; label: string; lang: string; code: string }[] = [
  {
    id: "curl",
    label: "curl",
    lang: "Expect HTTP 402 and a base64 payment-required header.",
    code: `curl -si ${API_BASE}/api/price -H "Accept: application/json"`,
  },
  {
    id: "script",
    label: "Script",
    lang: "The reference customer pays and prints the settlement tx.",
    code: `API_URL=${API_BASE} pnpm --filter @mavera/scripts customer`,
  },
  {
    id: "ts",
    label: "TypeScript",
    lang: "Any EVM signer works; the facilitator pays the gas.",
    code: `import { ExactEvmScheme } from "@x402/evm";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as \`0x\${string}\`);
const client = new x402Client();
client.register("eip155:10143", new ExactEvmScheme(signer));

const pay = wrapFetchWithPayment(fetch, client);
const res = await pay("${API_BASE}/api/price");
console.log(res.status, await res.json());`,
  },
];

function ForAgents() {
  return (
    <div className="mx-auto mt-16 w-full min-w-0 max-w-2xl text-left">
      <h3 className="text-lg font-medium text-cream">For agents and scripts</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        The same endpoint, paid without a browser.
      </p>
      <Tabs defaultValue="curl" className="mt-5 w-full min-w-0 flex-col gap-3">
        <TabsList
          aria-label="Client examples"
          className="h-auto w-fit rounded-full bg-white/6 p-1"
        >
          {SNIPPETS.map((s) => (
            <TabsTrigger
              key={s.id}
              value={s.id}
              className="h-11 rounded-full px-4 text-sm text-muted-foreground hover:text-cream focus-visible:ring-2 focus-visible:ring-honey data-[state=active]:bg-cream! data-[state=active]:text-[#1a1206]! data-[state=active]:shadow-none"
            >
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SNIPPETS.map((s) => (
          <TabsContent key={s.id} value={s.id} className="w-full min-w-0">
            <div className="overflow-hidden rounded-2xl bg-[#070d1a] ring-1 ring-white/[0.07]">
              <div className="flex items-center justify-between gap-3 border-b hairline py-1 pr-1 pl-4">
                <p className="truncate text-sm text-muted-foreground">
                  {s.lang}
                </p>
                <CopyButton value={s.code} label={`Copy ${s.label}`} />
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-sky/90 [scrollbar-width:thin]">
                <code>{s.code}</code>
              </pre>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/** The "try it" device: one centred panel, a segmented control, one form. */
export function TryIt() {
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<TabId>(DEFAULT_TAB);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    call: null,
    buy: null,
    claim: null,
  });

  function select(next: TabId) {
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + TABS.length) % TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = TABS.length - 1;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      select(TABS[nextIndex].id);
    }
  }

  return (
    <Section
      id="try"
      title="Buy. Call. Claim."
      description="Connect a wallet on Monad testnet. Test USDC: faucet.circle.com. Test MON: faucet.monad.xyz."
      align="center"
    >
      <Reveal className="relative mx-auto max-w-2xl text-left">
        <DevicePanel glow="none" className="p-5 sm:p-10">
          <div
            role="tablist"
            aria-label="Try Mavera"
            onKeyDown={onKeyDown}
            className="mx-auto flex max-w-xs rounded-full bg-white/6 p-1"
          >
            {TABS.map((t) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  ref={(node) => {
                    tabRefs.current[t.id] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`try-tab-${t.id}`}
                  aria-selected={active}
                  aria-controls={`try-panel-${t.id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "relative h-11 flex-1 rounded-full text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-honey active:scale-[0.98]",
                    active
                      ? "text-[#1a1206]"
                      : "text-muted-foreground hover:text-cream",
                  )}
                >
                  {active ? (
                    reduced ? (
                      <span className="absolute inset-0 rounded-full bg-cream" />
                    ) : (
                      <motion.span
                        layoutId="try-pill"
                        className="absolute inset-0 rounded-full bg-cream"
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 32,
                        }}
                      />
                    )
                  ) : null}
                  <span className="relative z-10">{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-10">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                role="tabpanel"
                id={`try-panel-${tab}`}
                aria-labelledby={`try-tab-${tab}`}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
              >
                {tab === "call" ? <CallForm /> : null}
                {tab === "buy" ? <BuyForm /> : null}
                {tab === "claim" ? <ClaimForm /> : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </DevicePanel>
      </Reveal>
      <ForAgents />
    </Section>
  );
}
