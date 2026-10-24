"use client";

import { useLenis } from "lenis/react";
import { Menu, X } from "lucide-react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "motion/react";
import { Dialog } from "radix-ui";
import { type MouseEvent, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { EASE_OUT, SPRING_SNAPPY } from "@/components/motion/tokens";
import { WalletButton } from "@/components/wallet/wallet-button";
import { useScrollSpy } from "@/hooks/use-scroll-spy";
import { NAV_ITEMS } from "@/lib/site";
import { cn } from "@/lib/utils";

const IDS = NAV_ITEMS.map((i) => i.href.slice(1));

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-honey focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1324]";

/**
 * Fixed header: transparent over the hero, glass + hairline after 24 px.
 * A 1.5 px honey line tracks page scroll progress; a shared pill marks the
 * section in view.
 */
export function Nav() {
  const reduced = useReducedMotion() === true;
  const { scrollY, scrollYProgress } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const active = useScrollSpy(IDS);
  const lenis = useLenis();

  useMotionValueEvent(scrollY, "change", (y) => {
    const next = y > 24;
    setScrolled((prev) => (prev === next ? prev : next));
  });

  const goMobile = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setOpen(false);
    // Wait for the dialog to release the scroll lock before gliding.
    window.setTimeout(() => {
      if (lenis) lenis.scrollTo(href, { offset: -88, duration: 1.1 });
      else document.querySelector(href)?.scrollIntoView();
      history.replaceState(null, "", href);
    }, 60);
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-500",
        scrolled ? "glass hairline" : "border-transparent",
      )}
    >
      <motion.div
        aria-hidden
        style={{ scaleX: scrollYProgress }}
        className="absolute inset-x-0 top-0 h-[1.5px] origin-left bg-honey"
      />
      <div className="mx-auto flex h-[72px] w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-10">
        <Logo size="sm" />

        <nav aria-label="Sections" className="hidden md:block">
          <LayoutGroup id="nav-desktop">
            <ul className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = active === item.href.slice(1);
                return (
                  <li key={item.href} className="relative">
                    {isActive ? (
                      <motion.span
                        layoutId="nav-active"
                        aria-hidden
                        transition={reduced ? { duration: 0 } : SPRING_SNAPPY}
                        className="absolute inset-x-0 top-1/2 h-9 -translate-y-1/2 rounded-full bg-white/8"
                      />
                    ) : null}
                    <a
                      href={item.href}
                      aria-current={isActive ? "location" : undefined}
                      className={cn(
                        "relative inline-flex h-11 items-center rounded-full px-3.5 text-sm transition-colors",
                        FOCUS,
                        isActive
                          ? "text-cream"
                          : "text-muted-foreground hover:text-cream active:text-cream/80",
                      )}
                    >
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </LayoutGroup>
        </nav>

        <div className="flex items-center gap-1.5">
          <WalletButton />
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-full text-cream transition-colors hover:bg-white/8 active:bg-white/12 md:hidden",
                  FOCUS,
                )}
              >
                <Menu aria-hidden className="size-5" />
              </button>
            </Dialog.Trigger>
            <AnimatePresence>
              {open ? (
                <Dialog.Portal forceMount>
                  <Dialog.Overlay asChild forceMount>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduced ? 0 : 0.25 }}
                      className="fixed inset-0 z-50 bg-[#0b1324]/70 backdrop-blur-sm"
                    />
                  </Dialog.Overlay>
                  <Dialog.Content asChild forceMount>
                    <motion.div
                      initial={reduced ? { opacity: 0 } : { y: "-100%" }}
                      animate={reduced ? { opacity: 1 } : { y: 0 }}
                      exit={reduced ? { opacity: 0 } : { y: "-100%" }}
                      transition={
                        reduced
                          ? { duration: 0 }
                          : { duration: 0.45, ease: EASE_OUT }
                      }
                      className="hairline fixed inset-x-0 top-0 z-50 border-b bg-[#0e1830] px-4 pt-3 pb-6 shadow-2xl shadow-black/50"
                    >
                      <div className="flex h-12 items-center justify-between">
                        <Dialog.Title className="text-sm text-muted-foreground">
                          Sections
                        </Dialog.Title>
                        <Dialog.Description className="sr-only">
                          Jump to a section of the page.
                        </Dialog.Description>
                        <Dialog.Close asChild>
                          <button
                            type="button"
                            aria-label="Close menu"
                            className={cn(
                              "inline-flex size-11 items-center justify-center rounded-full text-cream transition-colors hover:bg-white/8 active:bg-white/12",
                              FOCUS,
                            )}
                          >
                            <X aria-hidden className="size-5" />
                          </button>
                        </Dialog.Close>
                      </div>
                      <ul className="mt-2 flex flex-col">
                        {NAV_ITEMS.map((item, i) => {
                          const isActive = active === item.href.slice(1);
                          return (
                            <motion.li
                              key={item.href}
                              initial={reduced ? false : { opacity: 0, y: -8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: 0.4,
                                ease: EASE_OUT,
                                delay: reduced ? 0 : 0.08 + i * 0.04,
                              }}
                              className="hairline border-b last:border-b-0"
                            >
                              <a
                                href={item.href}
                                onClick={(e) => goMobile(e, item.href)}
                                aria-current={isActive ? "location" : undefined}
                                className={cn(
                                  "flex min-h-14 items-center justify-between rounded-lg px-1 text-lg transition-colors active:bg-white/5",
                                  FOCUS,
                                  isActive
                                    ? "text-cream"
                                    : "text-cream/75 hover:text-cream",
                                )}
                              >
                                {item.label}
                                {isActive ? (
                                  <span
                                    aria-hidden
                                    className="size-1.5 rounded-full bg-honey"
                                  />
                                ) : null}
                              </a>
                            </motion.li>
                          );
                        })}
                      </ul>
                    </motion.div>
                  </Dialog.Content>
                </Dialog.Portal>
              ) : null}
            </AnimatePresence>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
