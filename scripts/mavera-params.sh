#!/usr/bin/env bash
# scripts/mavera-params.sh — shared by deploy.sh and verify.sh. Source it, do not execute it.
#
# Loads the root .env (never printed), puts Foundry 1.8.6 first on PATH (the system forge may be
# 1.7.1, which cannot parse `network = "monad"` in contracts/foundry.toml) and defines the demo
# constructor parameters from docs/02-CONTRACT-SPEC.md:
#   constructor(IERC20 usdc, address creator, uint256 sharePrice, uint256 maxSupply,
#               uint256 creatorShares, string name_, string symbol_, string endpoint_)
# Every value can be overridden from the environment (CREATOR, SHARE_PRICE, MAX_SUPPLY,
# CREATOR_SHARES, TOKEN_NAME, TOKEN_SYMBOL, ENDPOINT) — verify.sh must use the same values
# that deploy.sh used.

MAVERA_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAVERA_REPO_ROOT="$(cd "${MAVERA_SCRIPTS_DIR}/.." && pwd)"

FOUNDRY_186_BIN="${FOUNDRY_186_BIN:-/private/tmp/claude-501/-Users-mericcintosun-mavera/38506f39-5f28-4aea-9d46-7803f2bf4450/scratchpad/tools/foundry-1.8.6}"
if [ -d "${FOUNDRY_186_BIN}" ]; then
  export PATH="${FOUNDRY_186_BIN}:${PATH}"
fi

# .env: KEY=value lines only (the tracked template is .env.example). Exported so forge/cast see them.
ENV_FILE="${ENV_FILE:-${MAVERA_REPO_ROOT}/.env}"
if [ -f "${ENV_FILE}" ]; then
  set -o allexport
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +o allexport
else
  echo "warning: ${ENV_FILE} not found; relying on the current environment" >&2
fi

: "${MONAD_RPC_URL:=https://testnet-rpc.monad.xyz}"
: "${USDC_ADDRESS:=0x534b2f3A21130d7a60830c2Df862319e593943A3}"
EXPLORER_URL="${NEXT_PUBLIC_EXPLORER_URL:-https://testnet.monadscan.com}"
EXPLORER_URL="${EXPLORER_URL%/}"
MONADVISION_URL="https://testnet.monadvision.com"
SOURCIFY_URL="https://sourcify-api-monad.blockvision.org/"
CHAIN_ID=10143

# Demo parameters (docs/02-CONTRACT-SPEC.md section 1): 0.01 USDC per 1e18 share, 60 of 100 shares
# to the creator, the paid route /api/price.
SHARE_PRICE="${SHARE_PRICE:-10000}"
MAX_SUPPLY="${MAX_SUPPLY:-100000000000000000000}"
CREATOR_SHARES="${CREATOR_SHARES:-60000000000000000000}"
TOKEN_NAME="${TOKEN_NAME:-Mavera Shares: MON/USD Price API}"
TOKEN_SYMBOL="${TOKEN_SYMBOL:-mPRICE}"
ENDPOINT="${ENDPOINT:-/api/price}"

CONSTRUCTOR_SIG="constructor(address,address,uint256,uint256,uint256,string,string,string)"
# Relative to `--root contracts` (forge does not accept contracts/src/... together with --root).
CONTRACT_ROOT="${MAVERA_REPO_ROOT}/contracts"
CONTRACT="src/Mavera.sol:Mavera"

require_foundry_18() {
  if ! command -v forge >/dev/null 2>&1 || ! command -v cast >/dev/null 2>&1; then
    echo "error: forge/cast not found; install Foundry >= 1.8 (foundryup) or set FOUNDRY_186_BIN" >&2
    return 1
  fi
  local version
  version="$(forge --version 2>/dev/null | sed -n 's/^forge Version: *//p' | head -1)"
  case "${version}" in
    1.[0-7].*|0.*)
      echo "error: forge ${version} cannot parse network = \"monad\" in contracts/foundry.toml; need >= 1.8 (found at ${FOUNDRY_186_BIN}?)" >&2
      return 1
      ;;
  esac
  echo "forge ${version} ($(command -v forge))"
}

# Sets DEPLOYER_ADDR and SIGNER_ARGS (array) from DEPLOYER_PRIVATE_KEY (non-interactive) or
# DEPLOYER_ACCOUNT (Foundry keystore; cast/forge prompt for its password).
resolve_signer() {
  if [ -n "${DEPLOYER_PRIVATE_KEY:-}" ]; then
    SIGNER_ARGS=(--private-key "${DEPLOYER_PRIVATE_KEY}")
    DEPLOYER_ADDR="$(cast wallet address --private-key "${DEPLOYER_PRIVATE_KEY}")"
    SIGNER_KIND="DEPLOYER_PRIVATE_KEY"
  elif [ -n "${DEPLOYER_ACCOUNT:-}" ]; then
    SIGNER_ARGS=(--account "${DEPLOYER_ACCOUNT}")
    echo "using Foundry keystore '${DEPLOYER_ACCOUNT}' (password prompt follows)"
    DEPLOYER_ADDR="$(cast wallet address --account "${DEPLOYER_ACCOUNT}")"
    SIGNER_KIND="DEPLOYER_ACCOUNT ${DEPLOYER_ACCOUNT}"
  else
    echo "error: set DEPLOYER_PRIVATE_KEY (0x + 64 hex) or DEPLOYER_ACCOUNT (keystore name) in .env" >&2
    return 1
  fi
}

# Sets CREATOR: explicit CREATOR, else the deployer address (resolve_signer first when possible).
resolve_creator() {
  if [ -n "${CREATOR:-}" ]; then
    return 0
  fi
  if [ -n "${DEPLOYER_ADDR:-}" ]; then
    CREATOR="${DEPLOYER_ADDR}"
  elif [ -n "${DEPLOYER_PRIVATE_KEY:-}" ]; then
    CREATOR="$(cast wallet address --private-key "${DEPLOYER_PRIVATE_KEY}")"
  elif [ -n "${DEPLOYER_ACCOUNT:-}" ]; then
    CREATOR="$(cast wallet address --account "${DEPLOYER_ACCOUNT}")"
  else
    echo "error: cannot determine the creator; set CREATOR=0x... (or DEPLOYER_PRIVATE_KEY / DEPLOYER_ACCOUNT)" >&2
    return 1
  fi
}

print_params() {
  cat <<EOF
constructor parameters (${CONSTRUCTOR_SIG}):
  usdc          ${USDC_ADDRESS}
  creator       ${CREATOR}
  sharePrice    ${SHARE_PRICE}   (USDC atomic units per 1e18 share)
  maxSupply     ${MAX_SUPPLY}
  creatorShares ${CREATOR_SHARES}
  name          "${TOKEN_NAME}"
  symbol        "${TOKEN_SYMBOL}"
  endpoint      "${ENDPOINT}"
EOF
}

is_address() {
  [[ "${1:-}" =~ ^0x[0-9a-fA-F]{40}$ ]]
}
