#!/usr/bin/env bash
# scripts/verify.sh — verify the deployed Mavera on Sourcify/MonadVision (no key) and on Monadscan
# via the Etherscan V2 API (ETHERSCAN_API_KEY from .env; skipped with a message when empty).
#
# Usage (any cwd):  ./scripts/verify.sh <MAVERA_ADDRESS>     (defaults to MAVERA_ADDRESS from .env)
#   The constructor arguments must equal the deployed ones: same CREATOR / SHARE_PRICE / MAX_SUPPLY /
#   CREATOR_SHARES / TOKEN_NAME / TOKEN_SYMBOL / ENDPOINT overrides as deploy.sh (defaults from
#   docs/02-CONTRACT-SPEC.md; CREATOR defaults to the deployer address).
# Spec: docs/05-TEST-PLAN.md (Verification), docs/07-RUNBOOK.md. A verification failure never undoes
# a deployment; re-run this script.
set -euo pipefail

# shellcheck source=mavera-params.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/mavera-params.sh"
cd "${MAVERA_REPO_ROOT}"

ADDRESS="${1:-${MAVERA_ADDRESS:-}}"
if ! is_address "${ADDRESS}" || [ "${ADDRESS}" = "0x0000000000000000000000000000000000000000" ]; then
  echo "usage: $0 <MAVERA_ADDRESS>   (0x + 40 hex; or set MAVERA_ADDRESS in .env)" >&2
  exit 2
fi

require_foundry_18
# Non-interactive: derive the creator from the private key when available; the keystore path prompts.
if [ -z "${CREATOR:-}" ] && [ -n "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  CREATOR="$(cast wallet address --private-key "${DEPLOYER_PRIVATE_KEY}")"
fi
resolve_creator
print_params

CTOR_ARGS="$(cast abi-encode "${CONSTRUCTOR_SIG}" \
  "${USDC_ADDRESS}" "${CREATOR}" "${SHARE_PRICE}" "${MAX_SUPPLY}" "${CREATOR_SHARES}" \
  "${TOKEN_NAME}" "${TOKEN_SYMBOL}" "${ENDPOINT}")"
echo "abi-encoded constructor args: ${CTOR_ARGS}"
echo "contract ${CONTRACT} at ${ADDRESS} on chain ${CHAIN_ID}"

STATUS=0

echo
echo "== 1/2 Sourcify (MonadVision), ${SOURCIFY_URL} =="
if forge verify-contract "${ADDRESS}" "${CONTRACT}" \
    --root "${CONTRACT_ROOT}" \
    --chain "${CHAIN_ID}" \
    --verifier sourcify \
    --verifier-url "${SOURCIFY_URL}" \
    --constructor-args "${CTOR_ARGS}"; then
  echo "sourcify: submitted"
else
  echo "sourcify: FAILED (re-run later; the deployment is unaffected)" >&2
  STATUS=1
fi
echo "MonadVision:  ${MONADVISION_URL}/address/${ADDRESS}"
echo "Sourcify API: ${SOURCIFY_URL}v2/contract/${CHAIN_ID}/${ADDRESS}"
# forge submits an asynchronous job; poll the contract record once so the match status is on screen.
if command -v curl >/dev/null 2>&1; then
  sleep 5
  echo "sourcify record (expect \"match\": \"exact_match\" or \"match\"; null means still processing or failed):"
  curl -sS --max-time 15 "${SOURCIFY_URL}v2/contract/${CHAIN_ID}/${ADDRESS}" || echo "(sourcify record not reachable)"
  echo
fi

echo
echo "== 2/2 Monadscan (Etherscan V2 API, chain ${CHAIN_ID}) =="
if [ -z "${ETHERSCAN_API_KEY:-}" ]; then
  echo "skipped: ETHERSCAN_API_KEY is empty in .env. Create a free key at https://etherscan.io/myapikey,"
  echo "         set ETHERSCAN_API_KEY=... and re-run: ./scripts/verify.sh ${ADDRESS}"
else
  if forge verify-contract "${ADDRESS}" "${CONTRACT}" \
      --root "${CONTRACT_ROOT}" \
      --chain "${CHAIN_ID}" \
      --verifier etherscan \
      --etherscan-api-key "${ETHERSCAN_API_KEY}" \
      --constructor-args "${CTOR_ARGS}" \
      --watch; then
    echo "monadscan: verified"
  else
    echo "monadscan: FAILED (check the compiler settings in contracts/foundry.toml and re-run)" >&2
    STATUS=1
  fi
fi
echo "Monadscan:    ${EXPLORER_URL}/address/${ADDRESS}#code"

exit "${STATUS}"
