# scripts

Operational scripts. Everything here is a stub (header comment + TODO) until event hours.

| File | Purpose | Spec |
| --- | --- | --- |
| `deploy.sh` | Deploy `Mavera` to Monad testnet and print address + explorer links | `docs/07-RUNBOOK.md` |
| `verify.sh` | Verify on Sourcify and Monadscan | `docs/07-RUNBOOK.md` |
| `customer.ts` | One paid x402 call from the demo customer wallet | `docs/03-X402-FLOW.md` |
| `load-test.ts` | ~50 paid calls in a row for the demo | `docs/07-RUNBOOK.md` |
| `faucet-notes.md` | Where to get MON and testnet USDC, limits, addresses | — |

TypeScript scripts run with `tsx` and read the root `.env` (`pnpm --filter @mavera/scripts load-test`).
