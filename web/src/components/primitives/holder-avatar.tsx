import Image from "next/image";
import { MEDIA } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Character crops: source image, focal point (0-1) and zoom (image height in avatar heights). */
const CROPS = {
  bear: { img: MEDIA.logoMark, fx: 0.5, fy: 0.44, zoom: 1.2 },
  fox: { img: MEDIA.bearBuy, fx: 0.73, fy: 0.46, zoom: 2.1 },
  rabbit: { img: MEDIA.bearClaim, fx: 0.33, fy: 0.3, zoom: 1.75 },
  robot: { img: MEDIA.bearCall, fx: 0.34, fy: 0.35, zoom: 2.3 },
} as const;

export type HolderWho = "bear" | "fox" | "rabbit" | "robot" | "you" | "other";

/** Circular mascot avatar; "you" is a honey ring, "other" a navy "+" disc. */
export function HolderAvatar({
  who,
  size = 40,
  className,
}: {
  who: HolderWho;
  size?: number;
  className?: string;
}) {
  const base = cn(
    "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-white/10",
    className,
  );
  if (who === "you") {
    return (
      <span
        className={cn(
          base,
          "bg-honey/10 font-medium text-honey ring-2 ring-honey",
        )}
        style={{ width: size, height: size, fontSize: size * 0.3 }}
      >
        You
      </span>
    );
  }
  if (who === "other") {
    return (
      <span
        aria-hidden="true"
        className={cn(base, "bg-navy-3 text-muted-foreground")}
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      >
        +
      </span>
    );
  }
  const c = CROPS[who];
  const h = size * c.zoom;
  const w = (h * c.img.width) / c.img.height;
  return (
    <span
      className={cn(base, "bg-navy-2")}
      style={{ width: size, height: size }}
    >
      <Image
        src={c.img.src}
        alt=""
        width={Math.round(w)}
        height={Math.round(h)}
        className="absolute max-w-none"
        style={{
          width: w,
          height: h,
          left: size / 2 - c.fx * w,
          top: size / 2 - c.fy * h,
        }}
      />
    </span>
  );
}
