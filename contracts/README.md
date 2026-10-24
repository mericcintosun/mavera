# Mavera contracts

Foundry project (Foundry 1.8.6 with `network = "monad"`, solc 0.8.37, evm `osaka`, OpenZeppelin Contracts v5.7.0,
forge-std v1.17.0) targeting Monad testnet (chain id 10143). Specification: `docs/02-CONTRACT-SPEC.md`;
test plan: `docs/05-TEST-PLAN.md`; deploy/verify procedure: `docs/07-RUNBOOK.md` section D.

## What is implemented

| Path | Content |
| --- | --- |
| `src/Mavera.sol` | `contract Mavera is ERC20, ReentrancyGuardTransient` (164 lines). Shares (18 decimals) in the revenue of one x402-paid API. `buy(shares)` mints at a fixed `sharePrice` (cost rounds up, proceeds go to `creator`), `sync()` distributes every USDC unit that landed in the contract pro rata (ERC-1726 accumulator, magnifier 1e36), `claim()` pays the caller exactly `claimable(msg.sender)`. `claimable()` is pending-inclusive; `pending()` is floored at zero; `payTo()` returns the contract (route lock) and `endpoint()` the paired route string. `_update` reverts on transfers to the contract, syncs before every balance move (attribution-exact), and keeps entitlements constant through `corrections`. Checks-effects-interactions throughout; `SafeCast` for every int/uint conversion; `SafeERC20` for USDC. |
| `test/MockUSDC.sol` | 6-decimal ERC-20 with a free `mint`, plus `ReentrantUSDC` which re-enters a configured call once on `transfer`/`transferFrom` and records the inner result. |
| `test/Mavera.t.sol` | 33 unit tests and 4 fuzz tests, including the worked example of the spec (section 8) with exact integers. |
| `test/invariant/MaveraHandler.sol` | Bounded handler: 6 actors (creator + 5), actions `pay` (1..1e9 units), `sync`, `buy`, `transfer`, `transferFrom`, `claim`; never reverts (`fail_on_revert = true`); ghost sums `ghost_paid`, `ghost_claimed`, `ghost_proceeds`, `ghost_R` (sync remainders), monotonicity ghosts; INV-10/11/12/13 asserted inside the actions. |
| `test/invariant/MaveraInvariant.t.sol` | 10 `invariant_*` functions (INV-1 solvency, INV-2 cash identity, INV-3 accounted identity, INV-4 conservation with dust <= H, INV-5 exact dust `dust * M == R + sum rho`, INV-6 entitlement conservation, INV-7 per-holder sanity and `claimable` never reverting, INV-8 supply/zero-address, INV-9 monotonicity, buy proceeds never pool) plus `afterInvariant()`. Only the handler is targeted. |
| `script/Deploy.s.sol` | `Deploy` script: reads `USDC_ADDRESS` (required), `CREATOR` (default: broadcaster), `SHARE_PRICE` (10000), `MAX_SUPPLY` (100e18), `CREATOR_SHARES` (60e18), `TOKEN_NAME`, `TOKEN_SYMBOL`, `ENDPOINT` ("/api/price") via `vm.envOr`; logs chain id, address and the abi-encoded constructor args for verification. |
| `.gas-snapshot` | `forge snapshot` output (47 entries). |

Constructor: `constructor(IERC20 usdc, address creator, uint256 sharePrice, uint256 maxSupply, uint256 creatorShares, string name, string symbol, string endpoint)`.
Demo parameters: USDC `0x534b2f3A21130d7a60830c2Df862319e593943A3`, sharePrice `10000` (0.01 USDC per share), maxSupply `100e18`,
creatorShares `60e18`, name `Mavera Shares: MON/USD Price API`, symbol `mPRICE`, endpoint `/api/price`.

## Tests

```sh
cd contracts
forge build --sizes             # Mavera runtime 5,115 B, initcode 7,396 B
forge test -vvv                 # 38 tests: 33 unit + 4 fuzz (512 runs each) + 1 invariant campaign (10 invariants)
FOUNDRY_PROFILE=ci forge test   # fuzz 2048 runs, invariants 256 x 128
forge test --gas-report
forge snapshot --check
forge fmt --check
forge lint                      # clean
slither .                       # static analysis (config: slither.config.json)
```

Results on 2026-10-24 (default profile): `38 tests passed, 0 failed` in about 12 s. Invariant campaign: 128 runs x 64 depth
= 8,192 handler calls, 0 reverts, every selector exercised about 1,350 times. All 10 invariants hold; `afterInvariant()`
re-checks INV-5 and INV-6 on the final state. Fuzz: `testFuzz_SingleHolderGetsEverything`, `testFuzz_TwoHoldersSplit`,
`testFuzz_CostCeil`, `testFuzz_RandomSequence` (4 actors, 50 steps, INV-1..INV-9 checked at the end), 512 runs each.

Fork note: `foundry.toml` no longer sets a default `eth_rpc_url` (removed 2026-10-24): with one, `forge test` forked Monad
testnet over the public RPC (37 unit tests took 140 s instead of 0.3 s; the invariant campaign would have taken far longer and
hit the 25 rps cap in CI). Tests run on the in-memory EVM with the Monad gas model; live commands pass `--rpc-url` explicitly
(`[rpc_endpoints]` keeps `monad_testnet`). `slither .` is the static-analysis gate; its output and triage live in `docs/slither.md`.

## Gas (forge 1.8.6, `network = "monad"`, `isolate = true`, per transaction)

| Function | Min | Avg | Median | Max | Note |
| --- | --- | --- | --- | --- | --- |
| `buy` | 49,163 | 128,833 | 118,145 | 222,316 | includes the USDC `transferFrom` to the creator and the nested sync |
| `sync` | 48,587 | 59,726 | 48,587 | 104,558 | min is the no-op path; an effective sync is about 104k cold |
| `claim` | 65,815 | 115,001 | 116,291 | 233,816 | includes the USDC `transfer` |
| `transfer` | 22,430 | 99,486 | 96,743 | 203,714 | `test_Gas_TransferWithSyncInUpdate`: 97,442 with `pending() == 0`, 102,412 with `pending() > 0` |
| `transferFrom` | 34,150 | 96,925 | 96,925 | 159,700 | |
| `claimable` (view) | 12,571 | 22,893 | 12,977 | 53,272 | one USDC `balanceOf` call inside |

Relayer gas limit for `sync()`: 104,558 max measured; 150,000 (the runbook default) keeps a 40 % margin.

## Deploy and verify (docs/07-RUNBOOK.md section D)

```sh
cd contracts
set -a; source ../.env; set +a
# Option A: forge script (reads USDC_ADDRESS etc. from the environment; CREATOR defaults to the broadcaster)
export CREATOR=<HOLDER_A>
forge script script/Deploy.s.sol:Deploy --rpc-url $MONAD_RPC_URL --account mavera-deployer \
  --broadcast --slow --gas-estimate-multiplier 110
# Option B: forge create (arguments in declaration order)
forge create src/Mavera.sol:Mavera --rpc-url $MONAD_RPC_URL --account mavera-deployer --broadcast \
  --constructor-args $USDC_ADDRESS $CREATOR 10000 100000000000000000000 60000000000000000000 \
  "Mavera Shares: MON/USD Price API" mPRICE /api/price
```

`--private-key $DEPLOYER_PRIVATE_KEY` works in place of `--account mavera-deployer`; keys are never hardcoded. Then set
`MAVERA_ADDRESS`, `NEXT_PUBLIC_MAVERA_ADDRESS` and `PAY_TO` in `.env` to the deployed address and verify on both explorers:

```sh
export MAVERA_ADDRESS=<DEPLOYED_TO>
CTOR_ARGS=$(cast abi-encode "constructor(address,address,uint256,uint256,uint256,string,string,string)" \
  $USDC_ADDRESS $CREATOR 10000 100000000000000000000 60000000000000000000 \
  "Mavera Shares: MON/USD Price API" mPRICE /api/price)
# MonadVision / Sourcify (no key)
forge verify-contract $MAVERA_ADDRESS src/Mavera.sol:Mavera --chain 10143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
# Monadscan via the Etherscan V2 API (free etherscan.io key)
forge verify-contract $MAVERA_ADDRESS src/Mavera.sol:Mavera --chain 10143 \
  --verifier etherscan --etherscan-api-key $ETHERSCAN_API_KEY --constructor-args $CTOR_ARGS --watch
```

The deploy script prints the same abi-encoded constructor args, so they can be pasted into `--constructor-args`
directly. Smoke test afterwards: `cast call $MAVERA_ADDRESS "payTo()(address)" --rpc-url $MONAD_RPC_URL` must return
`$MAVERA_ADDRESS`, and a direct USDC transfer to the contract followed by `sync()` must raise `totalDistributed()`.

Dependencies are git submodules under `lib/` pinned in `../.gitmodules` and `foundry.lock`.
