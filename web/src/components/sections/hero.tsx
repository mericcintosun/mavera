"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { type PointerEvent, useRef } from "react";
import { LiveLine } from "@/components/hero/live-line";
import { SpeechBubble } from "@/components/hero/speech-bubble";
import { EASE_OUT } from "@/components/motion/tokens";
import { PillLink } from "@/components/primitives/pill";
import { RevealText } from "@/components/primitives/reveal-text";
import { MEDIA, SITE } from "@/lib/site";

/** Melts the video rectangle into the navy page (its background is the same colour). */
const VIDEO_MASK =
  "radial-gradient(62% 68% at 50% 50%, #000 42%, rgba(0,0,0,0.6) 62%, transparent 84%)";

const PARALLAX_MAX = 10;
const PARALLAX_SPRING = { stiffness: 320, damping: 30, mass: 0.6 };

/* Page-load choreography (seconds). Everything settles before 1.6 s. */
const T = { bubble: 0.1, video: 0, headline: 0.35, sub: 0.85, ctas: 1.0 };

export function Hero() {
  const reduced = useReducedMotion() === true;
  const ref = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const scrollY = useTransform(scrollYProgress, [0, 1], [0, 60]);

  // Pointer parallax: motion values only, no re-render per frame.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, PARALLAX_SPRING);
  const sy = useSpring(py, PARALLAX_SPRING);
  const videoX = useTransform(sx, (v) => v);
  const videoY = useTransform(
    [sy, scrollY],
    ([a, b]) => (a as number) + (b as number),
  );
  const bubbleX = useTransform(sx, (v) => v * -0.5);
  const bubbleY = useTransform(sy, (v) => v * -0.5);

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (reduced || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    px.set(nx * 2 * PARALLAX_MAX);
    py.set(ny * 2 * PARALLAX_MAX);
  };
  const onPointerLeave = () => {
    px.set(0);
    py.set(0);
  };

  const rise = (delay: number) =>
    // Same initial on server and client (no hydration mismatch); reduced
    // motion only drops the duration so the state change is instant.
    ({
      initial: { opacity: 0, y: 16 },
      animate: { opacity: 1, y: 0 },
      transition: reduced
        ? { duration: 0 }
        : { duration: 0.6, ease: EASE_OUT, delay },
    });

  return (
    <section
      id="hero"
      ref={ref}
      aria-labelledby="hero-title"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="relative overflow-hidden pt-24 pb-20 sm:pt-24 sm:pb-28"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 text-center sm:px-10">
        <motion.div
          style={{ x: bubbleX, y: bubbleY }}
          className="relative z-10 flex w-full justify-center"
        >
          <SpeechBubble delay={T.bubble} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reduced
              ? { duration: 0 }
              : { duration: 0.9, ease: EASE_OUT, delay: T.video }
          }
          style={{ x: videoX, y: videoY }}
          className="pointer-events-none -mt-2 w-full max-w-3xl sm:-mt-6 lg:max-w-[40rem]"
        >
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={MEDIA.heroPoster}
            aria-hidden
            className="vignette aspect-video w-full object-cover"
            style={{ WebkitMaskImage: VIDEO_MASK, maskImage: VIDEO_MASK }}
          >
            <source src={MEDIA.heroVideoWebm} type="video/webm" />
            <source src={MEDIA.heroVideoMp4} type="video/mp4" />
          </video>
        </motion.div>

        <RevealText
          as="h1"
          id="hero-title"
          immediate
          delay={T.headline}
          text="A paid API that pays its holders."
          className="display -mt-2 max-w-4xl text-balance text-[2.75rem] leading-[1.02] tracking-[-0.02em] text-cream sm:-mt-6 sm:text-7xl lg:text-[5rem]"
        />

        <motion.p
          {...rise(T.sub)}
          className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          Agents pay {SITE.priceUsd} per call over x402. The USDC lands in the
          contract and is split across every share in the same Monad block.
        </motion.p>

        <motion.div
          {...rise(T.ctas)}
          className="mt-9 flex w-full flex-col items-center gap-6"
        >
          <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row">
            <PillLink href="#try" variant="primary" size="lg">
              Call the API for {SITE.priceUsd}
            </PillLink>
            <PillLink href="#playground" variant="secondary" size="lg">
              Try the math
            </PillLink>
          </div>
          <LiveLine />
        </motion.div>
      </div>
    </section>
  );
}
