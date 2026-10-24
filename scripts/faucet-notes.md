# Faucet notes

Where the demo wallets get test MON and test USDC on Monad testnet (chain id 10143), how much each wallet
needs, and the two Monad rules that bite when funding late (the 10 MON reserve-balance budget and the
3-block funding delay). Amounts and limits were verified on 2026-10-24; re-check the faucet pages on the
day. Companion documents: [docs/07-RUNBOOK.md](../docs/07-RUNBOOK.md) and
[docs/10-MONAD-NOTES.md](../docs/10-MONAD-NOTES.md).

## Sources

| Asset | Source | Amount and limit | Notes |
| --- | --- | --- | --- |
| MON | https://faucet.monad.xyz | per the faucet page | Official Monad testnet faucet (accessed 2026-10-24) |
| MON | Blitz platform https://blitz.devnads.com (after sign-in, "Faucet" tab, enter a `0x...` address) | 50 MON per sign-in | Event faucet; every teammate can claim |
| MON | Event Telegram group | 1,000-2,000 MON on request | Ask the organizer if the public faucets are dry |
| USDC | https://faucet.circle.com -> network "Monad Testnet" -> token USDC | 20 USDC per request; one request per (asset, testnet) pair per address every 2 hours | Circle's `FiatTokenV2_2` at `0x534b2f3A21130d7a60830c2Df862319e593943A3` (6 decimals, EIP-3009 + EIP-2612) |

The devnads test USDC (`0x56bf9CDc3C1876F3F22655a0016C2743E9e39a73`, https://devnads.com/tokens) is a
different contract without EIP-3009 and is **not** an x402 asset. Do not fund the customer wallets with it.

## Who needs what

| Wallet | Needs | Why | Source |
| --- | --- | --- | --- |
| Deployer (`mavera-deployer` keystore) | > 10 MON (deploy costs about 2-3 M gas at the 100 MON-gwei floor, roughly 0.2-0.3 MON) | Deploys `Mavera`; the 10 MON reserve-balance budget must stay covered | MON faucets |
| Relayer (`RELAYER_PRIVATE_KEY`) | > 10 MON; no USDC | Calls `sync()` (about 0.015 MON per call at a 150k gas limit) | MON faucets |
| Customer wallets x2 (`CUSTOMER_PRIVATE_KEY` and a spare) | 20 USDC each; MON only for the permit fallback | Pay $0.01 per x402 call (facilitator pays the gas); 20 USDC covers 2,000 calls | Circle faucet |
| Buyer / holder wallets x2 (browser wallets) | 1 USDC and > 10 MON each | Buy shares (the whole demo float of 40e18 shares costs 0.4 USDC at 10,000 units per share) and pay gas for `buy()` / `claim()` | Circle faucet + MON faucets |
| Creator (receives `buy()` proceeds) | nothing | Receives USDC from `buy()`; can be the deployer | - |

## Two Monad rules

- **Reserve balance.** Consensus admits transactions only while the sender's gas budget, min(10 MON, balance
  three blocks ago), covers the gas limit of all in-flight transactions. Keep every sending wallet above 10 MON
  and set explicit gas limits; Monad charges the gas limit, not the gas used.
- **Fresh funds settle after 3 blocks.** A newly funded account can send only once the funding transaction is
  3 blocks old (about 0.9-1.2 s). Fund wallets minutes, not seconds, before the demo.

## Check balances

Run from any directory; pass `--rpc-url` explicitly (`cast chain` does not know chain 10143 by name).

```sh
cast balance <ADDRESS> --ether --rpc-url https://testnet-rpc.monad.xyz
cast call 0x534b2f3A21130d7a60830c2Df862319e593943A3 "balanceOf(address)(uint256)" <ADDRESS> --rpc-url https://testnet-rpc.monad.xyz
cast call 0x534b2f3A21130d7a60830c2Df862319e593943A3 "decimals()(uint8)" --rpc-url https://testnet-rpc.monad.xyz
```

USDC balances are in 6-decimal units: `20000000` = 20 USDC.

## Funding plan

| # | Wallet | Needs | Source | When | Done |
| --- | --- | --- | --- | --- | --- |
| 1 | Deployer | 50 MON | Blitz platform (50 MON) or faucet.monad.xyz | before deploying | [ ] |
| 2 | Relayer | 20 MON | faucet.monad.xyz / Telegram | before the first paid call | [ ] |
| 3 | Customer A | 20 USDC | faucet.circle.com | first thing; again after 2 h if needed | [ ] |
| 4 | Customer B (spare) | 20 USDC | faucet.circle.com | first thing | [ ] |
| 5 | Buyer A | 1 USDC + 15 MON | faucet.circle.com (20 USDC) + MON faucet | before the page demo | [ ] |
| 6 | Buyer B | 1 USDC + 15 MON | same | before the page demo | [ ] |

The Circle faucet limit is per address: funding six addresses takes six requests, not six two-hour waits.

## Open questions

- Exact amount the official Monad faucet dispenses per request on event day (not re-verified at 11:30).
- Whether the Telegram faucet is still offered for Ankara v4 (handoff information, not verified on the platform).
