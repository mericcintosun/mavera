# Mavera contracts

Foundry project (Foundry >= 1.8 with `network = "monad"`, OpenZeppelin Contracts v5.7.0,
forge-std v1.17.0) targeting Monad testnet (chain id 10143).

```sh
forge build
forge test -vvv                       # unit + fuzz + invariant (settings in foundry.toml)
FOUNDRY_PROFILE=ci forge test         # heavier fuzz/invariant runs
forge fmt --check
slither .                             # static analysis (config: slither.config.json)
```

Dependencies are git submodules under `lib/` pinned in `../.gitmodules` and `foundry.lock`.
Deployment and verification commands: `docs/07-RUNBOOK.md`.
