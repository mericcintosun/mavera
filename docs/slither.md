# Slither report — `contracts/src/Mavera.sol`

Run on 2026-10-24 (event day, before 12:30 Europe/Istanbul) with Slither 0.11.6, forge 1.8.6 (commit 6bad0a66), solc 0.8.37,
`evm_version = "osaka"`, `network = "monad"`; last commit at the time of the run: `6890bbe`. Command, from `contracts/`
(Foundry 1.8.6 first on `PATH`, as [05-TEST-PLAN.md](05-TEST-PLAN.md) requires):

```sh
PATH=<foundry-1.8.6>:$PATH slither . --filter-paths "lib/" --exclude-dependencies --checklist
```

Configuration: [`contracts/slither.config.json`](../contracts/slither.config.json) (`filter_paths: lib/`, `exclude_dependencies`,
`detectors_to_exclude: solc-version,naming-convention`, `fail_on: none`). Slither compiled the project itself through
crytic-compile (`forge clean`, `forge build --build-info --deny never --skip ./test/** ./script/** --force`): 16 contracts,
100 detectors. Two runs are recorded below: run 1 on the untriaged contract, run 2 after the triage annotations.

## Triage

| ID | Detector | Location | Impact / confidence | Verdict | Reason |
| --- | --- | --- | --- | --- | --- |
| ID-0 | `incorrect-equality` | `Mavera.sync()`: `if (p == 0) return;` (`src/Mavera.sol`, line 100 in run 1) | Medium / High | false positive | `p = pending()` is a `uint256` floored at zero (`balance > accounted ? balance - accounted : 0`), so `== 0` is the exact and only no-op test; the detector flags any strict equality on a value derived from an external `balanceOf`. The early return keeps `sync()` idempotent (spec section 5.3, INV "no `Synced(0)`"). Annotated with `// slither-disable-next-line incorrect-equality` plus the reason on the same line. |
| ID-1 | `incorrect-equality` | `Mavera.claim()`: `if (amount == 0) revert NothingToClaim();` (`src/Mavera.sol`, line 112 in run 1) | Medium / High | false positive | `amount = _claimableAt(accPerShare, msg.sender)` is a `uint256` floored at zero; the check implements the spec's `NothingToClaim()` revert (section 3) and surfaces at `eth_estimateGas`. Annotated the same way. |

Outcome: no High or Medium true positive, nothing fixed in the logic, no detector excluded beyond the two already in the
config. `forge fmt --check`, `forge build --locked --sizes`, `forge lint` and `forge test` (38 tests) were re-run after the
annotations and stayed green. The CI job (`.github/workflows/contracts.yml`, `slither`) runs the same detectors with
`fail-on: none` and uploads SARIF; this file is the human gate.

## Run 1 — untriaged contract (verbatim)

```text
'forge clean' running (wd: /Users/mericcintosun/mavera/contracts)
'forge config --json' running
'forge build --build-info --deny never --skip ./test/** ./script/** --force' running (wd: /Users/mericcintosun/mavera/contracts)
INFO:Detectors:
Detector: incorrect-equality
Mavera.claim() (src/Mavera.sol#109-117) uses a dangerous strict equality:
	- amount == 0 (src/Mavera.sol#112)
Mavera.sync() (src/Mavera.sol#96-106) uses a dangerous strict equality:
	- p == 0 (src/Mavera.sol#100)
Reference: https://github.com/crytic/slither/wiki/Detector-Documentation#dangerous-strict-equalities
INFO:Slither:. analyzed (16 contracts with 100 detectors), 2 result(s) found
**THIS CHECKLIST IS NOT COMPLETE**. Use `--show-ignored-findings` to show all the results.
Summary
 - [incorrect-equality](#incorrect-equality) (2 results) (Medium)
## incorrect-equality
Impact: Medium
Confidence: High
 - [ ] ID-0
[Mavera.sync()](src/Mavera.sol#L96-L106) uses a dangerous strict equality:
	- [p == 0](src/Mavera.sol#L100)

src/Mavera.sol#L96-L106


 - [ ] ID-1
[Mavera.claim()](src/Mavera.sol#L109-L117) uses a dangerous strict equality:
	- [amount == 0](src/Mavera.sol#L112)

src/Mavera.sol#L109-L117
```

## Run 2 — after the `slither-disable-next-line` annotations (verbatim)

```text
'forge clean' running (wd: /Users/mericcintosun/mavera/contracts)
'forge config --json' running
'forge build --build-info --deny never --skip ./test/** ./script/** --force' running (wd: /Users/mericcintosun/mavera/contracts)
INFO:Slither:. analyzed (16 contracts with 100 detectors), 0 result(s) found
**THIS CHECKLIST IS NOT COMPLETE**. Use `--show-ignored-findings` to show all the results.
Summary
```
