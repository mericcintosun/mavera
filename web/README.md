# @mavera/web

Next.js 16 (App Router, TypeScript strict, Tailwind CSS 4, Biome, Vitest) front end and
x402 API server for Mavera. Configuration only until event hours; see `docs/04-FRONTEND.md`
and `docs/03-X402-FLOW.md` for what gets built here.

```sh
pnpm install            # from the repo root (pnpm workspace)
pnpm --filter @mavera/web dev
pnpm --filter @mavera/web typecheck   # next typegen + tsc --noEmit
pnpm --filter @mavera/web lint        # biome check
pnpm --filter @mavera/web test        # vitest run
pnpm --filter @mavera/web build
```

Environment variables: copy `../.env.example` to `../.env` and run `pnpm env:link` at the root
(creates `web/.env.local -> ../.env`). The schema lives in `src/lib/env.ts`.
