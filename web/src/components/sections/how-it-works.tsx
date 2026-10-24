"use client";

import { useLenis } from "lenis/react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { SPRING_SNAPPY } from "@/components/motion/tokens";
import { DevicePanel } from "@/components/primitives/device-panel";
import { Section } from "@/components/sections/section";
import {
  DeviceStage,
  StepDevice,
  type StepKey,
} from "@/components/story/step-devices";
import { use402Challenge } from "@/hooks/use-402-challenge";
import { cn } from "@/lib/utils";

const STEPS: { key: StepKey; title: string; copy: string }[] = [
  {
    key: "ask",
    title: "They ask.",
    copy: "GET /api/price answers 402 with the price and the payee.",
  },
  {
    key: "sign",
    title: "They sign.",
    copy: "An EIP-3009 USDC authorization: no gas, no account.",
  },
  {
    key: "settle",
    title: "It settles.",
    copy: "The Monad facilitator moves $0.01 into the contract and pays the gas.",
  },
  {
    key: "split",
    title: "It splits.",
    copy: "sync() adds the payment per share for every holder in the same block.",
  },
  {
    key: "claim",
    title: "Holders claim.",
    copy: "claimable() is exactly what claim() pays.",
  },
];

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

function StepBlock({
  step,
  active,
  desktop,
  onActive,
  onSelect,
  challenge,
}: {
  step: (typeof STEPS)[number];
  active: boolean;
  desktop: boolean;
  onActive: (key: StepKey) => void;
  onSelect: (key: StepKey, el: HTMLElement) => void;
  challenge: ReturnType<typeof use402Challenge>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { margin: "-45% 0px -45% 0px" });
  const mobileSeen = useInView(ref, { once: true, amount: 0.3 });
  useEffect(() => {
    if (inView) onActive(step.key);
  }, [inView, onActive, step.key]);

  return (
    <div
      ref={ref}
      data-step={step.key}
      className="flex min-w-0 flex-col justify-center py-6 lg:min-h-[52vh] lg:py-0"
    >
      <button
        type="button"
        aria-pressed={active}
        aria-controls={desktop ? "how-device" : undefined}
        onClick={(e) =>
          onSelect(step.key, e.currentTarget.parentElement as HTMLElement)
        }
        className={cn(
          "group relative w-full min-h-11 rounded-xl py-3 pr-4 pl-6 text-left outline-none transition-colors duration-300",
          "hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-honey/70 active:bg-white/[0.05]",
        )}
      >
        {active && desktop ? (
          <motion.span
            layoutId={reduced ? undefined : "how-active-bar"}
            transition={SPRING_SNAPPY}
            aria-hidden="true"
            className="absolute top-3 bottom-3 left-0 w-[3px] rounded-full bg-honey"
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute top-3 bottom-3 left-0 w-px bg-white/10"
          />
        )}
        <span
          className={cn(
            "display block text-3xl transition-colors duration-300 sm:text-4xl",
            active || !desktop
              ? "text-cream"
              : "text-white/35 group-hover:text-white/60",
          )}
        >
          {step.title}
        </span>
        <span
          className={cn(
            "mt-2 block max-w-md text-base leading-relaxed transition-colors duration-300",
            active || !desktop ? "text-muted-foreground" : "text-white/30",
          )}
        >
          {step.copy}
        </span>
      </button>
      {!desktop ? (
        <DevicePanel glow="none" className="mt-5 p-4 sm:p-6">
          <StepDevice
            step={step.key}
            active={mobileSeen}
            challenge={challenge}
          />
        </DevicePanel>
      ) : null}
    </div>
  );
}

export function HowItWorks() {
  const desktop = useIsDesktop();
  const lenis = useLenis();
  const [active, setActive] = useState<StepKey>("ask");
  const challenge = use402Challenge();
  const { run, status } = challenge;
  const ranRef = useRef(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const sectionSeen = useInView(sectionRef, { once: true, amount: 0.05 });

  // The real 402 runs once, the first time the ask state is on screen.
  useEffect(() => {
    if (ranRef.current || status !== "idle") return;
    if (
      (desktop && active === "ask" && sectionSeen) ||
      (!desktop && sectionSeen)
    ) {
      ranRef.current = true;
      run();
    }
  }, [active, desktop, sectionSeen, status, run]);

  const onSelect = (key: StepKey, el: HTMLElement) => {
    setActive(key);
    if (lenis) lenis.scrollTo(el, { offset: -120, duration: 1.1 });
    else el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <Section
      id="how"
      title="A call, start to finish."
      description="Five things happen between an agent asking for a price and a holder getting paid, and each one below runs on the live contract."
      className="overflow-x-clip"
    >
      <div
        ref={sectionRef}
        className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16"
      >
        <div className="min-w-0 lg:pb-[20vh]">
          {STEPS.map((step) => (
            <StepBlock
              key={step.key}
              step={step}
              active={desktop ? active === step.key : true}
              desktop={desktop}
              onActive={setActive}
              onSelect={onSelect}
              challenge={challenge}
            />
          ))}
        </div>
        {desktop ? (
          <div className="relative min-w-0">
            <div id="how-device" className="sticky top-28">
              <DevicePanel glow="none" className="p-6 xl:p-8">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {STEPS.find((s) => s.key === active)?.title}
                  </p>
                  <div aria-hidden="true" className="flex gap-1.5">
                    {STEPS.map((s) => (
                      <span
                        key={s.key}
                        className={cn(
                          "h-1 w-5 rounded-full transition-colors duration-300",
                          s.key === active ? "bg-honey" : "bg-white/10",
                        )}
                      />
                    ))}
                  </div>
                </div>
                <div className="hairline mb-5" />
                <DeviceStage step={active} challenge={challenge} />
              </DevicePanel>
            </div>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
