---
marp: true
theme: default
paginate: true
size: 16:9
title: Mavera, a paid API as shares
description: Four slides for the Monad Blitz Ankara v4 pitch, 24 Oct 2026. Built from docs/08-DEMO-AND-PITCH.md.
style: |
  :root { --accent: #2fb67c; --ink: #0f172a; --muted: #475569; }
  section { font-size: 30px; padding: 56px 72px; color: var(--ink); background: #ffffff; line-height: 1.3; }
  section h1 { font-size: 54px; color: var(--ink); margin-bottom: 18px; }
  section h2 { font-size: 40px; color: var(--accent); margin: 0 0 14px 0; }
  section strong { color: var(--accent); }
  section ul { margin: 0; padding-left: 1.1em; }
  section li { margin: 10px 0; }
  section footer { color: var(--muted); font-size: 18px; }
  section .big { font-size: 52px; font-weight: 700; line-height: 1.15; margin: 0 0 22px 0; }
  section .sub { font-size: 28px; color: var(--muted); font-style: italic; margin: 0 0 26px 0; }
  section .number { font-size: 76px; font-weight: 800; color: var(--accent); line-height: 1; margin: 0; }
  section .number small { font-size: 26px; color: var(--muted); font-weight: 500; display: block; margin-top: 8px; }
  section .cols { display: flex; gap: 40px; align-items: center; }
  section .cols > div:first-child { flex: 1.15; }
  section .cols > div:last-child { flex: 1; }
  section .cols img { width: 100%; border-radius: 14px; box-shadow: 0 6px 24px rgba(0,0,0,.18); }
  section.flow img { display: block; width: 100%; margin: 0 auto 10px auto; }
  section.flow .caps { display: flex; gap: 20px; margin-top: 6px; }
  section.flow .caps div { flex: 1; font-size: 24px; border-top: 4px solid var(--accent); padding-top: 8px; }
  section.flow .caps b { color: var(--accent); }
  section .vs { margin: 8px 0; padding: 14px 18px; border-left: 6px solid var(--accent); background: #f1f5f9; font-size: 28px; }
  section .vs b { color: var(--ink); }
  section .tiny { font-size: 18px; color: var(--muted); margin-top: 18px; }
---

<!-- _paginate: false -->
<!-- _footer: "Mavera · Monad Blitz Ankara v4 · 24 Oct 2026 · Monad testnet (chain 10143), Circle test USDC" -->

<div class="cols">
<div>

# Mavera

<p class="big">Mavera turns a paid API into shares; every x402 call pays the holders within one Monad block.</p>

<p class="sub">A bear sells honey; every time a jar sells, coins drip into his friends' cups.</p>

<p class="number">USD 0.01<small>per API call, in USDC, split to the share holders</small></p>

</div>
<div>

![Mavera hero](img/hero-1200x630.png)

</div>
</div>

<!--
D0, 0:00-0:12. Said: "Mavera turns a paid API into shares; every x402 call pays the holders within one Monad block. A bear sells honey; every time a jar sells, coins drip into his friends' cups. Each call costs one cent."
Then switch to the terminals: D1 deploy, D2 customer pays via x402, D3 settlement on Monadscan, D4 the fountain climbs, D5 claim.
-->

---

<!-- _class: flow -->

## How it works: one call, one block

![End-to-end flow: customer, 402, signed payment, facilitator, USDC, Mavera contract, holders](img/README--1.svg)

<div class="caps">
<div><b>1. Call, 402</b><br>GET /api/price answers 402 with payTo = the contract.</div>
<div><b>2. Signed payment</b><br>The client signs an EIP-3009 authorization; no gas, no account.</div>
<div><b>3. Settle</b><br>The Monad facilitator moves 0.01 USDC into Mavera and pays the gas.</div>
<div><b>4. sync, claim</b><br>sync() splits it per share; holders pull with claim().</div>
</div>

<!--
Backup slide if the live demo dies, or the 3-minute "on-chain vs off-chain" beat.
Said: "What is on-chain: the cap table, the custody, the split, the payout. What is off-chain: the customer's signature, the facilitator that settles it, the data itself, and a server poller so fifty browsers do not hit the public RPC. Every row has a reason."
The payment is the input; the product is the share that gets paid.
-->

---

## Why Monad, and why a chain at all

- **The payer is a machine.** x402: an agent with no bank account signs a USDC authorization; the server answers 402, then 200.
- **The payee is the contract.** payTo is Mavera itself, so payment and dividend are one atomic flow; the operator never holds the revenue.
- **Sub-cent split per call is only sane here.** One distribution, sync() at a 200,000-gas limit, costs about **USD 0.0004** at the 100 MON-gwei minimum base fee: under 5% of a 1-cent call.
- **Visible in about 300 ms, final at about 600 ms.** On a 12-second chain the fountain would not move.
- **Monad runs a public x402 facilitator**, which pays the settlement gas; API Hub lists 136 pay-per-call services on mainnet today.

<p class="tiny">Sources: docs.monad.xyz (block time, gas pricing), x402-facilitator.molandak.org, app.monad.xyz/agents/api-hub, accessed 24 Oct 2026. Testnet build; mainnet would need a KYC allow-list and a licensed wrapper.</p>

<!--
D6 and "Why a chain, not Stripe", 1:21-1:46.
Said: "Why a chain and not Stripe: the payer is a machine with no bank account; the payee is the contract, so payment and dividend are one atomic flow; and the share is a bearer token anyone can hold. The chain is the cap table and the escrow, not the payment rail."
Numbers: "visible in about 300 ms, final at about 600 ms"; "about four hundredths of a cent per distribution, under 5% of a 1-cent call, at the minimum base fee". Never say "300 ms finality".
-->

---

## Our difference: one permissionless contract, per call

<div class="vs"><b>vs Stripe Connect splits:</b> a custodial, revocable promise from the operator's bank account. In Mavera the operator never touches the money; the client refuses to pay anything but the contract.</div>

<div class="vs"><b>vs revenue-share tokens that pay monthly:</b> a company, a vault or a bond in the loop (x402commit, Bondrail). Mavera distributes every call within one Monad block, and anyone can call sync().</div>

<div class="vs"><b>vs plain x402 endpoints:</b> the operator keeps all the revenue; no shared upside. Mavera's shares are a transferable ERC-20 cash-flow claim: the only thing that moves it is customers paying.</div>

<p class="tiny">Accounting is the ERC-1726 dividend-token pattern (2019). Of 1,759 approved Blitz projects scanned on 24 Oct 2026, none combines an x402-paid API, ERC-20 shares and per-call distribution. Testnet proof of concept with test USDC. Not an offer of securities.</p>

<!--
D7 and D8, 1:46-2:00.
Said: "This is not a hype token: the only thing that moves it is customers paying. x402commit and Bondrail add a company, a vault or a bond; Mavera is one permissionless contract, per call. Thank you."
3-minute variant: "The accounting is ERC-1726 from 2019; Terra used it for rent at Blitz Mumbai; of 1,759 Blitz projects we scanned, none combines a paid API, ERC-20 shares and per-call distribution. We are the minimal permissionless version, not the first idea."
-->

<!--
Recording the 60-second demo video on macOS:
1. Cmd+Shift+5 and pick "Record Selected Portion", or QuickTime Player > File > New Screen Recording; set the browser window to 1920x1080.
2. Options: microphone on; turn on a Focus mode so notifications stay hidden; hide the Dock (Cmd+Option+D).
3. Record 60 seconds: terminal pays via x402, Monadscan shows the settlement, the fountain climbs, Claim lands USDC in MetaMask.
4. Stop with the menu-bar button; the .mov lands on the Desktop.
5. If an .mp4 is required: ffmpeg -i in.mov -vcodec h264 -acodec aac out.mp4
-->
