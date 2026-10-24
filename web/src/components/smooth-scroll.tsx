"use client";

import { ReactLenis } from "lenis/react";
import type { ReactNode } from "react";

/**
 * Lenis smooth scrolling for the whole document. `anchors: true` makes
 * in-page #links glide; the browser's native scroll is used on touch devices.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.11,
        smoothWheel: true,
        anchors: { offset: -88 },
        syncTouch: false,
      }}
    >
      {children}
    </ReactLenis>
  );
}
