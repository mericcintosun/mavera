"use client";

import { Plus } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { type ReactNode, useState } from "react";
import { EASE_OUT } from "@/components/motion/reveal";
import { SPRING_SNAPPY } from "@/components/motion/tokens";
import { TxLink } from "@/components/primitives/tx-link";
import { Section } from "@/components/sections/section";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { getClientEnv } from "@/lib/env";
import { KNOWN_TXS } from "@/lib/site";

const FACILITATOR_SIGNER = "0x7f6a2850669202519f0FE8aa912451238820Db86";

type Item = { id: string; q: string; a: ReactNode };

function buildItems(contract: string): Item[] {
  return [
    {
      id: "stripe",
      q: "Why not Stripe or Stripe Connect splits?",
      a: (
        <>
          <p>
            The customers are machines. An agent cannot open a Stripe account,
            but it can sign a USDC authorization.
          </p>
          <p>
            With Stripe the operator holds the money and promises to pay out.
            Here payTo is the contract, so the payment and the dividend are one
            atomic flow. And the claim is a bearer ERC-20 anyone can buy at
            1-cent granularity; Connect splits are custodial, revocable and
            jurisdiction-gated.
          </p>
        </>
      ),
    },
    {
      id: "gas",
      q: "Who pays the gas?",
      a: (
        <p>
          The customer pays none: a signature only. The facilitator pays the
          settlement, about 0.014 MON at the floor, from signer{" "}
          <TxLink hash={FACILITATOR_SIGNER} kind="address" />. The relayer pays
          for sync(), about 0.0204 MON at a 200,000-gas limit. A holder pays for
          their own claim().
        </p>
      ),
    },
    {
      id: "before",
      q: "What happens to revenue that arrived before I bought?",
      a: (
        <p>
          It stays with the holders who held at that moment. Every share
          transfer, buys included, runs sync() first, so revenue already in the
          contract is split before your shares exist. You earn from the next
          call on.
        </p>
      ),
    },
    {
      id: "facilitator",
      q: "What if the facilitator goes down?",
      a: (
        <p>
          The x402 path needs the facilitator even to emit a 402. The contract
          and the UI stay the same, with two fallbacks: receiveWithAuthorization
          (the customer stays gasless and the relayer submits) and permit plus
          pay().
        </p>
      ),
    },
    {
      id: "security",
      q: "Is this a security?",
      a: (
        <p>
          On testnet with test USDC it is a proof of concept of a mechanism;
          nothing is offered. A mainnet version would add a KYC allow-list and a
          licensed wrapper. Not an offer of securities.
        </p>
      ),
    },
    {
      id: "x402",
      q: "Why x402?",
      a: (
        <p>
          Any HTTP client can pay with it: the server answers 402 with the
          price, the client retries with a signed EIP-3009 USDC authorization,
          and the Monad facilitator settles it straight into the contract. One
          signature, one real transfer per call, no account and no API key. We
          measured 737 ms from the 402 to the 200, settlement included.
        </p>
      ),
    },
    {
      id: "real",
      q: "How do I know the numbers are real?",
      a: (
        <p>
          Paid calls and total distributed are read from the contract on Monad
          testnet, not from our server. Check the contract{" "}
          <TxLink hash={contract} kind="address" /> and the first settlement{" "}
          <TxLink hash={KNOWN_TXS.firstSettlement} /> on Monadscan.
        </p>
      ),
    },
  ];
}

function PlusIcon({ open }: { open: boolean }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover/faq:text-cream"
      animate={{ rotate: open ? 45 : 0 }}
      transition={reduced ? { duration: 0 } : SPRING_SNAPPY}
    >
      <Plus className="size-5" />
    </motion.span>
  );
}

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: EASE_OUT },
  },
};

export function Faq() {
  const [open, setOpen] = useState("");
  const reduced = useReducedMotion() === true;
  const items = buildItems(getClientEnv().NEXT_PUBLIC_MAVERA_ADDRESS);
  return (
    <Section id="faq" title="Questions jurors ask.">
      <motion.div
        variants={listVariants}
        initial={reduced ? false : "hidden"}
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
      >
        <Accordion
          type="single"
          collapsible
          value={open}
          onValueChange={setOpen}
          className="border-t border-white/[0.08]"
        >
          {items.map((item) => {
            const isOpen = open === item.id;
            return (
              <motion.div key={item.id} variants={rowVariants}>
                <AccordionItem
                  value={item.id}
                  className="group/row relative isolate border-b border-white/[0.08]"
                >
                  {isOpen ? (
                    <motion.span
                      aria-hidden="true"
                      layoutId={reduced ? undefined : "faq-active"}
                      transition={SPRING_SNAPPY}
                      className="pointer-events-none absolute inset-y-0 -inset-x-3 -z-10 rounded-2xl bg-white/[0.035] sm:-inset-x-5"
                    />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-6 bottom-6 -left-3 w-[2px] origin-center scale-y-0 rounded-full bg-honey shadow-[0_0_12px_rgba(245,181,43,0.55)] transition-transform duration-500 ease-out group-hover/row:scale-y-100 group-data-[state=open]/row:scale-y-100 sm:-left-5"
                  />
                  <AccordionPrimitive.Header className="flex">
                    <AccordionPrimitive.Trigger className="group/faq flex min-h-11 flex-1 items-center justify-between gap-6 rounded-lg py-5 text-left text-lg text-cream outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-honey focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b1324] active:opacity-80 sm:py-6">
                      <span className="text-pretty transition-transform duration-500 ease-out group-hover/faq:translate-x-1 group-data-[state=open]/faq:translate-x-1">
                        {item.q}
                      </span>
                      <PlusIcon open={isOpen} />
                    </AccordionPrimitive.Trigger>
                  </AccordionPrimitive.Header>
                  <AccordionPrimitive.Content className="overflow-hidden [--tw-duration:380ms] [--tw-ease:cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <motion.div
                      initial={false}
                      animate={
                        isOpen
                          ? { opacity: 1, y: 0, filter: "blur(0px)" }
                          : { opacity: 0, y: 10, filter: "blur(4px)" }
                      }
                      transition={
                        reduced
                          ? { duration: 0 }
                          : {
                              duration: 0.45,
                              ease: EASE_OUT,
                              delay: isOpen ? 0.08 : 0,
                            }
                      }
                      className="max-w-2xl pb-7 text-base leading-relaxed text-muted-foreground [&_a]:no-underline [&_p+p]:mt-3"
                    >
                      {item.a}
                    </motion.div>
                  </AccordionPrimitive.Content>
                </AccordionItem>
              </motion.div>
            );
          })}
        </Accordion>
      </motion.div>
    </Section>
  );
}
