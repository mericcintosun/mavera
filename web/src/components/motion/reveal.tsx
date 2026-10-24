"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/** Shared easing: calm, slightly overshoot-free ease-out. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: EASE_OUT },
  },
};

export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

type RevealProps = ComponentPropsWithoutRef<typeof motion.div> & {
  children: ReactNode;
  /** Delay in seconds before the element animates in. */
  delay?: number;
  /** Animate once when 20% of the element is in view (default) or on every entry. */
  once?: boolean;
};

/** Fades and lifts its children in when scrolled into view. */
export function Reveal({
  children,
  delay = 0,
  once = true,
  ...rest
}: RevealProps) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <motion.div {...rest}>{children}</motion.div>;
  }
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount: 0.2, margin: "0px 0px -8% 0px" }}
      variants={{
        hidden: fadeUp.hidden,
        show: {
          ...(fadeUp.show as object),
          transition: { duration: 0.7, ease: EASE_OUT, delay },
        },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Parent for a group of <StaggerItem>s; children animate in sequence. */
export function Stagger({
  children,
  once = true,
  ...rest
}: ComponentPropsWithoutRef<typeof motion.div> & {
  children: ReactNode;
  once?: boolean;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <motion.div {...rest}>{children}</motion.div>;
  }
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount: 0.15 }}
      variants={staggerParent}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  ...rest
}: ComponentPropsWithoutRef<typeof motion.div> & { children: ReactNode }) {
  return (
    <motion.div variants={fadeUp} {...rest}>
      {children}
    </motion.div>
  );
}
