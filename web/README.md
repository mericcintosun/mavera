# @mavera/web

Next.js 16 (App Router, TypeScript strict, Tailwind CSS 4, Biome, Vitest) front end and
x402 API server for Mavera. Spec: `docs/03-X402-FLOW.md` (paid route) and
`docs/04-FRONTEND.md` (page and state route).

```sh
pnpm install            # from the repo root (pnpm workspace)
pnpm --filter @mavera/web dev
pnpm --filter @mavera/web typecheck   # next typegen + tsc --noEmit
pnpm --filter @mavera/web lint        # biome check
pnpm --filter @mavera/web test        # vitest run (pure helpers)
pnpm --filter @mavera/web build
```

Environment variables: copy `../.env.example` to `../.env` and run `pnpm env:link` at the root
(creates `web/.env.local -> ../.env`). The schema lives in `src/lib/env.ts`; server env is parsed
lazily at request time, so `next build` needs no real values.

## What is here

| Path                                            | Purpose                                                                                                                                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/api/price/route.ts`                    | `GET /api/price`, the one x402-paid route: `withX402(handler, bareRouteConfig, server)`; payTo = the Mavera contract, price = `X402_PRICE_ATOMIC` USDC as an explicit `AssetAmount`; `onAfterSettle` hands `sync()` to `after()` |
| `src/app/api/state/route.ts`                    | `GET /api/state[?address=]`, free, server-cached (~1 s) snapshot every browser polls every 2 s                                                                                                                                   |
| `src/lib/oracle.ts`                             | Pyth + Stork MON/USD through one Multicall3 `eth_call`, per-source validity, median, heartbeat fields; `DATA_MODE=heartbeat` skips the oracles                                                                                   |
| `src/lib/state.ts`                              | the server poller (Mavera totals, pending, bounded `Synced` log scan, per-address figures)                                                                                                                                       |
| `src/lib/relayer.ts`                            | sends `sync()` from `RELAYER_PRIVATE_KEY` (gas 200k, 200 gwei / 2 gwei), coalesced, never throws                                                                                                                                 |
| `src/lib/lock.ts`, `format.ts`, `price-math.ts` | pure helpers with Vitest coverage (route lock, number formatting, oracle math)                                                                                                                                                   |
| `src/components/`                               | Header, Fountain, BuyCard, ClaimCard, CallApiCard (browser x402 payment with the route lock), Footer                                                                                                                             |

Smoke checks once `next dev` is running:

```sh
curl -si http://localhost:3000/api/state
curl -si http://localhost:3000/api/price -H 'Accept: application/json'   # HTTP 402 + payment-required header
```
