"use client";

import {
  type MotionValue,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * Four beats over one pinned scroll. Each beat masks up word by word with a
 * slight scale, then leaves with blur. A coin drops from "call" as the scene
 * ends. Reduced motion and short viewports get the lines stacked statically.
 */
const BEATS = [
  "No invoices.",
  "No payout runs.",
  "No one holding the money.",
  "Just a call.",
] as const;

const N = BEATS.length;

function Word({
  progress,
  range,
  children,
}: {
  progress: MotionValue<number>;
  range: [number, number];
  children: string;
}) {
  const y = useTransform(progress, range, ["105%", "0%"]);
  return (
    <span className="inline-block overflow-hidden pb-[0.12em] align-bottom">
      <motion.span style={{ y }} className="inline-block will-change-transform">
        {children}
      </motion.span>
    </span>
  );
}

function Beat({
  progress,
  index,
  text,
}: {
  progress: MotionValue<number>;
  index: number;
  text: string;
}) {
  const start = index / N;
  const end = (index + 1) / N;
  const last = index === N - 1;
  const span = end - start;
  // The next beat starts rising while the previous one blurs out.
  const enter = index === 0 ? start : start - span * 0.08;
  const inEnd = enter + span * 0.3;
  const outStart = end - span * 0.16;

  const opacity = useTransform(
    progress,
    last ? [enter, enter + 0.02] : [enter, enter + 0.02, outStart, end],
    last ? [0, 1] : [0, 1, 1, 0],
  );
  const scale = useTransform(progress, [enter, inEnd], [0.96, 1]);
  const yOut = useTransform(progress, [outStart, end], [0, last ? 0 : -40]);
  const blurPx = useTransform(progress, [outStart, end], [0, last ? 0 : 10]);
  const filter = useTransform(blurPx, (b) => `blur(${b}px)`);

  const words = text.split(" ");
  const step = (inEnd - enter) / (words.length + 1);
  return (
    <motion.p
      aria-hidden="true"
      style={{ opacity, scale, y: yOut, filter }}
      className="display absolute inset-x-0 mx-auto max-w-4xl px-4 text-center text-5xl leading-[1.05] tracking-[-0.02em] text-cream sm:text-6xl lg:text-7xl"
    >
      {words.map((w, i) => (
        <span key={`${index}-${w}`}>
          <Word
            progress={progress}
            range={[enter + step * i, enter + step * (i + 2)]}
          >
            {w}
          </Word>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
      {last ? <Coin progress={progress} /> : null}
    </motion.p>
  );
}

/** Honey coin that falls from "call" during the last stretch of the scene. */
function Coin({ progress }: { progress: MotionValue<number> }) {
  const y = useTransform(progress, [0.86, 1], [0, 220]);
  const opacity = useTransform(progress, [0.84, 0.88, 0.97, 1], [0, 1, 1, 0]);
  const rotate = useTransform(progress, [0.86, 1], [0, 200]);
  return (
    <motion.span
      aria-hidden="true"
      style={{ y, opacity, rotate }}
      className="pointer-events-none absolute right-[calc(50%-1.25em)] top-[0.9em] block size-7 rounded-full bg-honey shadow-[inset_-3px_-3px_0_rgba(0,0,0,0.2)] will-change-transform sm:size-9"
    >
      <span className="absolute left-1.5 top-1.5 size-2 rounded-full bg-cream/80 sm:size-2.5" />
    </motion.span>
  );
}

function useStaticFallback(): boolean {
  const reduced = useReducedMotion();
  const [short, setShort] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-height: 560px)");
    const update = () => setShort(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return Boolean(reduced) || short;
}

function PinnedBeats() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ["start start", "end end"],
  });
  const lineOpacity = useTransform(
    scrollYProgress,
    [0, 0.05, 0.95, 1],
    [0, 1, 1, 0],
  );

  return (
    <div ref={wrapperRef} className="relative h-[240vh]">
      <div className="sticky top-0 flex h-dvh items-center justify-center overflow-hidden">
        <p className="sr-only">{BEATS.join(" ")}</p>
        <div className="relative flex h-[1.2em] w-full items-center justify-center text-5xl sm:text-6xl lg:text-7xl">
          {BEATS.map((text, i) => (
            <Beat key={text} progress={scrollYProgress} index={i} text={text} />
          ))}
        </div>
        <motion.span
          aria-hidden="true"
          style={{ scaleX: scrollYProgress, opacity: lineOpacity }}
          className="absolute bottom-[14%] left-1/2 h-[2px] w-40 -translate-x-1/2 origin-left rounded-full bg-honey"
        />
      </div>
    </div>
  );
}

function StaticBeats() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-28 sm:px-10 sm:py-36">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 text-center sm:gap-12">
        {BEATS.map((text) => (
          <p
            key={text}
            className="display text-5xl leading-[1.05] tracking-[-0.02em] text-cream sm:text-6xl lg:text-7xl"
          >
            {text}
          </p>
        ))}
      </div>
    </div>
  );
}

export function Beats() {
  const isStatic = useStaticFallback();
  return (
    <section id="beats" aria-label="What Mavera removes" className="relative">
      {isStatic ? <StaticBeats /> : <PinnedBeats />}
    </section>
  );
}
