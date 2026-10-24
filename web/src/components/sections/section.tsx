import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/reveal";
import { RevealText } from "@/components/primitives/reveal-text";
import { cn } from "@/lib/utils";

/**
 * Page section: shared container, generous rhythm, a serif headline that
 * reveals word by word, an optional description and an optional aside
 * (for example a link) to the right of the heading on lg.
 * Pass `title` as a string to get the word reveal; a ReactNode renders as is.
 */
export function Section({
  id,
  title,
  description,
  aside,
  children,
  className,
  align = "left",
  size = "md",
  highlight,
}: {
  id: string;
  /** @deprecated Ignored. Eyebrow labels are no longer rendered. */
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  /** Rendered to the right of the heading on lg screens. */
  aside?: ReactNode;
  /** Words of a string title rendered in honey. */
  highlight?: string[];
  children: ReactNode;
  className?: string;
  align?: "left" | "center";
  size?: "md" | "lg";
}) {
  const titleClass = cn(
    "display text-balance text-cream",
    size === "lg"
      ? "text-5xl sm:text-6xl lg:text-7xl"
      : "text-4xl sm:text-5xl lg:text-6xl",
  );
  return (
    <section
      id={id}
      className={cn("relative scroll-mt-24 py-28 sm:py-36", className)}
      aria-labelledby={title ? `${id}-title` : undefined}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-10">
        {title ? (
          <div
            className={cn(
              "mb-14 sm:mb-20",
              aside && "lg:flex lg:items-end lg:justify-between lg:gap-10",
            )}
          >
            <div
              className={cn(
                "max-w-2xl",
                align === "center" && !aside && "mx-auto text-center",
              )}
            >
              {typeof title === "string" ? (
                <RevealText
                  as="h2"
                  id={`${id}-title`}
                  text={title}
                  highlight={highlight}
                  className={titleClass}
                />
              ) : (
                <h2 id={`${id}-title`} className={titleClass}>
                  {title}
                </h2>
              )}
              {description ? (
                <Reveal delay={0.15}>
                  <p
                    className={cn(
                      "mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg",
                      align === "center" && !aside && "mx-auto",
                    )}
                  >
                    {description}
                  </p>
                </Reveal>
              ) : null}
            </div>
            {aside ? (
              <Reveal delay={0.2} className="mt-6 shrink-0 lg:mt-0">
                {aside}
              </Reveal>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}
