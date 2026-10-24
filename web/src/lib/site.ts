// Copy, links and media used across the page. Keep every number here in sync
// with docs/08-DEMO-AND-PITCH.md ("Numbers to cite").

export const SITE = {
  name: "Mavera",
  tagline: "A paid API that pays its holders. Every call.",
  oneSentence:
    "Mavera turns a paid API into shares; every x402 call pays the holders within one Monad block.",
  metaphor:
    "A bear sells honey; every time a jar sells, coins drip into his friends' cups.",
  event: "Monad Blitz Ankara v4 · 24 Oct 2026",
  disclaimer:
    "Testnet proof of concept with Circle test USDC. Not an offer of securities.",
  priceUsd: "$0.01",
  priceAtomic: "10000",
  links: {
    github: "https://github.com/mericcintosun/mavera",
    docs: "https://github.com/mericcintosun/mavera/tree/main/docs",
    contractSpec:
      "https://github.com/mericcintosun/mavera/blob/main/docs/02-CONTRACT-SPEC.md",
    x402: "https://docs.monad.xyz/guides/x402-guide",
    monad: "https://docs.monad.xyz",
    faucetUsdc: "https://faucet.circle.com",
    faucetMon: "https://faucet.monad.xyz",
    facilitator: "https://x402-facilitator.molandak.org",
  },
} as const;

/** In-page navigation (section ids on the home page). */
export const NAV_ITEMS = [
  { href: "#how", label: "How it works" },
  { href: "#live", label: "Live" },
  { href: "#playground", label: "Playground" },
  { href: "#try", label: "Try it" },
  { href: "#faq", label: "FAQ" },
] as const;

/** Holders shown by name in live holder views (addresses from the testnet demo). */
export const DEMO_HOLDERS = [
  {
    key: "creator",
    label: "Creator",
    who: "bear",
    address: "0x573Bc9734DE835b00485CA6FE768a51dd765aDF7",
  },
  {
    key: "early",
    label: "Early buyer",
    who: "fox",
    address: "0xca1Ea6B9436F941e65B7842FB135Ef6Bc9F7CD00",
  },
] as const;

/** Real testnet transactions, copied from README.md (preflight from docs/03). */
export const KNOWN_TXS = {
  deploy: "0x98f178113ea31a120c990fba9f351fda887340c94ed25260f4bbb045a92f4568",
  firstSettlement:
    "0xdc3384666636bf00ee33e1a683faea03c55ad1b5c07759ae49272d438862aa1e",
  firstSync:
    "0x56a47ffbbecd6ab952a862c6ce74b668c3c4d05d07bb859938ae82452e29797d",
  buy: "0xa9b024861da98f01b88f41220fb78bf20c5fbb0eb62ed595aa80767b9baeea7f",
  claim: "0x0920d8757f2413e2274767ad08c5d86645d72744645de090543d04b0402c16ef",
  preflightSettlement:
    "0xc853cf3717fecbdad286bca05e8505cc6609eb0bf7573f83c6baeae7757ad437",
} as const;

/** Measured numbers. settleMs: 402 -> 200 including settlement (docs/03-X402-FLOW.md, "Pre-flight notes"). */
export const MEASURED = { settleMs: 737 } as const;

/** Optimised media in web/public/media (intrinsic pixel sizes for next/image). */
export const MEDIA = {
  heroVideoWebm: "/media/hero-loop.webm",
  heroVideoMp4: "/media/hero-loop.mp4",
  heroPoster: "/media/hero-poster.webp", // 1280x720
  bearHero: { src: "/media/bear-hero.webp", width: 1459, height: 989 },
  bearHeroNavy: {
    src: "/media/bear-hero-navy.webp",
    width: 1536,
    height: 1024,
  },
  bearBuy: { src: "/media/bear-buy.webp", width: 1501, height: 963 },
  bearCall: { src: "/media/bear-call.webp", width: 1530, height: 1024 },
  bearClaim: { src: "/media/bear-claim.webp", width: 1145, height: 1374 },
  logoMark: { src: "/media/logo-mark.webp", width: 1242, height: 1151 },
} as const;

/** Background colour sampled from the hero video and navy hero image. */
export const NAVY = "#0b1324";
