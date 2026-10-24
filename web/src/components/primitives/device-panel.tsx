"use client";

import {
  type ElementType,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useRef,
} from "react";
import { cn } from "@/lib/utils";

const GLOW = {
  honey: "bg-[radial-gradient(closest-side,rgba(245,181,43,0.22),transparent)]",
  mint: "bg-[radial-gradient(closest-side,rgba(47,182,124,0.22),transparent)]",
  none: "",
} as const;

/**
 * Shared surface for every panel: rounded glass with a hairline ring, an
 * optional soft glow underneath and a pointer-following spotlight (CSS
 * variables, no React state; off for touch and reduced motion).
 */
export function DevicePanel({
  children,
  className,
  glow = "honey",
  spotlight = true,
  as,
}: {
  children: ReactNode;
  className?: string;
  glow?: "honey" | "mint" | "none";
  spotlight?: boolean;
  as?: ElementType;
}) {
  const Tag = (as ?? "div") as "div";
  const ref = useRef<HTMLDivElement>(null);
  const onMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--sx", `${e.clientX - r.left}px`);
    el.style.setProperty("--sy", `${e.clientY - r.top}px`);
  }, []);
  return (
    <div className="relative">
      {glow !== "none" ? (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -inset-x-6 top-1/4 -bottom-10 -z-0 blur-2xl",
            GLOW[glow],
          )}
        />
      ) : null}
      <Tag
        ref={ref}
        onPointerMove={spotlight ? onMove : undefined}
        className={cn(
          "group/panel relative overflow-hidden rounded-[28px] bg-white/[0.035] ring-1 ring-white/[0.08] backdrop-blur-sm",
          className,
        )}
      >
        {spotlight ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 motion-reduce:hidden [@media(hover:hover)]:group-hover/panel:opacity-100"
            style={{
              background:
                "radial-gradient(420px circle at var(--sx, 50%) var(--sy, 0px), rgba(255,247,230,0.06), transparent 60%)",
            }}
          />
        ) : null}
        <div className="relative">{children}</div>
      </Tag>
    </div>
  );
}
