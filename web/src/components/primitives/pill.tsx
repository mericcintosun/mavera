"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Slot } from "radix-ui";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { SPRING_SNAPPY } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

/** Class recipe shared by Pill and PillLink. */
export const pillVariants = cva(
  "inline-flex min-h-11 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-honey focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1324] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-honey text-[#1a1206] hover:bg-honey-deep active:bg-honey-deep",
        secondary: "bg-white/8 text-cream hover:bg-white/12 active:bg-white/15",
        ghost: "text-cream hover:bg-white/6 active:bg-white/10",
      },
      size: {
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-[15px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type PillVariants = VariantProps<typeof pillVariants>;

/** Rounded action button with press/hover springs and a loading state. */
export function Pill({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  ...rest
}: Omit<ComponentPropsWithoutRef<typeof motion.button>, "children"> &
  PillVariants & { loading?: boolean; children?: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      whileTap={reduced || disabled ? undefined : { scale: 0.97 }}
      whileHover={reduced || disabled ? undefined : { y: -1 }}
      transition={SPRING_SNAPPY}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(pillVariants({ variant, size }), className)}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
      {children}
    </motion.button>
  );
}

/** Link styled as a Pill. Pass asChild to wrap a next/link <Link>. */
export function PillLink({
  className,
  variant,
  size,
  asChild = false,
  ...rest
}: ComponentPropsWithoutRef<"a"> & PillVariants & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      className={cn(
        pillVariants({ variant, size }),
        "transition-[color,background-color,transform] duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.97] motion-reduce:transform-none",
        className,
      )}
      {...rest}
    />
  );
}
