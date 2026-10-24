# scripts

Operational scripts for the Mavera demo on Monad testnet (chain 10143). TypeScript scripts run with
`tsx` and read the root `.env` (`tsx --env-file=../.env <file>`); the shell scripts source the same
`.env` themselves and work from any directory. Nothing here is imported by the web app.

| File | Purpose | Run | Spec |
| --- | --- | --- | --- |
| `deploy.sh` | Deploy `Mavera` with `forge create` (Foundry 1.8.6, `--root contracts`), print address, explorer links and the three `.env` lines | `./scripts/deploy.sh [--update-env]` | `docs/07-RUNBOOK.md` |
| `verify.sh` | Verify on Sourcify/MonadVision (no key) and Monadscan (Etherscan V2, `ETHERSCAN_API_KEY`; skipped when empty) | `./scripts/verify.sh <address>` | `docs/05-TEST-PLAN.md` |
| `customer.ts` | One paid x402 call (`GET /api/price`): 402 -> EIP-3009 signature -> 200 + `PAYMENT-RESPONSE`; prints body, settlement hash, USDC balance before/after | `pnpm --filter @mavera/scripts customer` | `docs/03-X402-FLOW.md` |
| `load-test.ts` | N sequential paid calls (default 50; `-- 20` or `LOAD_CALLS=20`), per-call latency, p50/p95, total USDC paid, Mavera counters before/after, JSON report in `out/` | `pnpm --filter @mavera/scripts load-test` | `docs/07-RUNBOOK.md` |
| `relayer.ts` | Polls `pending()` every second and sends `sync()` (gas 200000, 200 gwei / 2 gwei) when it is above zero; waits for each receipt; Ctrl-C exits cleanly | `pnpm --filter @mavera/scripts relayer` | `docs/02-CONTRACT-SPEC.md` |
| `lib.ts` | Shared: zod env schema, viem client for Monad testnet, the compiled Mavera ABI (re-exported from `abi.ts`), USDC/share formatting, route-locked x402 client factory, facilitator error vocabulary | imported by the three scripts | `docs/03-X402-FLOW.md` |
| `abi.ts` | GENERATED: the compiled `Mavera` ABI (`as const`, 49 entries) from `contracts/out/Mavera.sol/Mavera.json`; identical to `web/src/lib/abi/mavera.ts` | do not edit; regenerate | `docs/02-CONTRACT-SPEC.md` |
| `gen-abi.ts` | Regenerates `abi.ts` and `web/src/lib/abi/mavera.ts` from the Foundry artifact (runs the web Biome formatter) after `forge build --root contracts` | `pnpm --filter @mavera/scripts abi` | — |
| `mavera-params.sh` | Sourced by `deploy.sh` and `verify.sh`: loads `.env`, puts Foundry 1.8.6 on `PATH`, demo constructor parameters | sourced only | `docs/02-CONTRACT-SPEC.md` |
| `faucet-notes.md` | Where to get MON and testnet USDC, limits, addresses | — | — |

`out/` (load-test reports `load-<timestamp>.json`, deploy logs) is git-ignored.

## Environment

All scripts read the root `.env` (template: `.env.example`). Variables used here:

| Variable | Used by |
| --- | --- |
| `MONAD_RPC_URL`, `X402_NETWORK` (`eip155:10143`), `X402_FACILITATOR_URL` | all |
| `USDC_ADDRESS`, `MAVERA_ADDRESS` (route lock: the 402 `payTo` must equal it) | all |
| `API_URL` (`http://localhost:3000` locally, the Vercel URL in production) | `customer.ts`, `load-test.ts` |
| `CUSTOMER_PRIVATE_KEY` (holds testnet USDC; the facilitator pays the gas) | `customer.ts`, `load-test.ts` |
| `RELAYER_PRIVATE_KEY` (holds more than 10 MON, no USDC) | `relayer.ts` |
| `DEPLOYER_PRIVATE_KEY` or `DEPLOYER_ACCOUNT` (keystore; prompts for a password) | `deploy.sh`, `verify.sh` |
| `ETHERSCAN_API_KEY` (free key from etherscan.io; empty skips Monadscan) | `verify.sh` |
| `NEXT_PUBLIC_EXPLORER_URL` (default `https://testnet.monadscan.com`) | links |

Constructor parameters default to the demo values in `docs/02-CONTRACT-SPEC.md` (sharePrice `10000`,
maxSupply `100e18`, creatorShares `60e18`, name `Mavera Shares: MON/USD Price API`, symbol `mPRICE`,
endpoint `/api/price`, creator = deployer). Override with `CREATOR`, `SHARE_PRICE`, `MAX_SUPPLY`,
`CREATOR_SHARES`, `TOKEN_NAME`, `TOKEN_SYMBOL`, `ENDPOINT`; `verify.sh` must get the same values.

## Route lock (customer and load test)

The x402 client only signs when the 402 challenge offers `scheme == exact`, `network == X402_NETWORK`,
`payTo == MAVERA_ADDRESS` and `asset == USDC_ADDRESS` (case-insensitive). It is enforced twice: the
`paymentRequirementsSelector` only picks a matching option and `onBeforePaymentCreation` aborts before
any signature otherwise. Spend controls stay at the SDK defaults ($1 per payment, default-table assets;
Monad testnet USDC is in the `@x402/evm@2.28.0` table). Requests send `Accept: application/json` so the
server never answers with the HTML paywall.

x402 exports used: `x402Client` from `@x402/core/client`; `decodePaymentResponseHeader` and
`decodePaymentRequiredHeader` from `@x402/core/http`; `ExactEvmScheme` (client) from
`@x402/evm/exact/client`; `wrapFetchWithPayment` from `@x402/fetch`; types `Network`,
`PaymentRequirements`, `PaymentRequired`, `SettleResponse` from `@x402/core/types`. The signer is a viem
`privateKeyToAccount(CUSTOMER_PRIVATE_KEY)`.

## End-to-end order (event day)

```sh
cd ~/mavera
./scripts/deploy.sh --update-env            # 1. deploy; writes MAVERA_ADDRESS, NEXT_PUBLIC_MAVERA_ADDRESS, PAY_TO
./scripts/verify.sh "$MAVERA_ADDRESS"       # 2. Sourcify + Monadscan (needs ETHERSCAN_API_KEY for the latter)
pnpm env:link && pnpm dev                   # 3. web app on http://localhost:3000 (API_URL)
pnpm --filter @mavera/scripts relayer       # 4. in a second terminal; keep it running during the demo
pnpm --filter @mavera/scripts customer      # 5. one paid call: expect 200, a tx hash, balance down by 0.01 USDC
pnpm --filter @mavera/scripts load-test -- 50   # 6. rehearsal: 50 sequential paid calls, report in scripts/out/
```

Exit codes: `customer.ts` returns 0 when settled, 1 on any payment/transport failure (the facilitator
reason is explained: `insufficient_funds`, `invalid_payment_expired`, `unsupported_scheme`, ...), 2 when
the route answered 200 without a `PAYMENT-RESPONSE` header (served unpaid). `load-test.ts` returns 0 only
when every call settled. The relayer never sends while a previous `sync()` is in flight and logs
reserve-balance / nonce / timeout errors, then retries on the next tick.

Quality gates: `pnpm --filter @mavera/scripts typecheck`, `bash -n scripts/*.sh`. After any change to
`contracts/src/Mavera.sol`: `forge build --root contracts` then `pnpm --filter @mavera/scripts abi` (both ABI files are generated).
