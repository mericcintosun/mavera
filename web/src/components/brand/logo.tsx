import Image from "next/image";
import Link from "next/link";
import { MEDIA, SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Bear mark plus the lowercase wordmark set in the display font. */
export function Logo({
  size = "md",
  href = "/",
  className,
}: {
  size?: "sm" | "md" | "lg";
  href?: string | null;
  className?: string;
}) {
  const px = size === "lg" ? 56 : size === "md" ? 40 : 30;
  const text =
    size === "lg" ? "text-4xl" : size === "md" ? "text-2xl" : "text-xl";
  const inner = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src={MEDIA.logoMark.src}
        alt=""
        width={px}
        height={Math.round((px * MEDIA.logoMark.height) / MEDIA.logoMark.width)}
        priority
        className="drop-shadow-[0_0_14px_rgba(245,181,43,0.35)]"
      />
      <span
        className={cn(
          "font-display font-extrabold lowercase tracking-tight text-cream",
          text,
        )}
      >
        {SITE.name}
      </span>
    </span>
  );
  if (!href) {
    return inner;
  }
  return (
    <Link href={href} aria-label={`${SITE.name} home`} className="shrink-0">
      {inner}
    </Link>
  );
}
