#!/usr/bin/env bash
# scripts/deploy.sh — deploy Mavera to Monad testnet (chain 10143) with Foundry 1.8.6, non-interactively,
# and print the address, the explorer links and the three .env lines to set.
#
# Usage (any cwd):  ./scripts/deploy.sh [--update-env]
#   reads ../.env: MONAD_RPC_URL, DEPLOYER_PRIVATE_KEY (or DEPLOYER_ACCOUNT keystore -> password
#   prompt), USDC_ADDRESS; optional overrides CREATOR, SHARE_PRICE, MAX_SUPPLY, CREATOR_SHARES,
#   TOKEN_NAME, TOKEN_SYMBOL, ENDPOINT (defaults: docs/02-CONTRACT-SPEC.md demo parameters).
#   --update-env rewrites MAVERA_ADDRESS, NEXT_PUBLIC_MAVERA_ADDRESS and PAY_TO in .env (backup .env.bak).
# Spec: docs/07-RUNBOOK.md (deploy section). forge create uses the raw eth_estimateGas result as the
# gas limit (Monad bills the limit; no multiplier wanted) and must not get --legacy.
set -euo pipefail

# shellcheck source=mavera-params.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/mavera-params.sh"
cd "${MAVERA_REPO_ROOT}"

UPDATE_ENV=0
for arg in "$@"; do
  case "${arg}" in
    --update-env) UPDATE_ENV=1 ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: ${arg}" >&2; exit 2 ;;
  esac
done

require_foundry_18
resolve_signer
resolve_creator

if [ ! -f "${CONTRACT_ROOT}/src/Mavera.sol" ]; then
  echo "error: ${CONTRACT_ROOT}/src/Mavera.sol does not exist yet" >&2
  exit 1
fi
if ! is_address "${USDC_ADDRESS}" || ! is_address "${CREATOR}"; then
  echo "error: USDC_ADDRESS (${USDC_ADDRESS}) and CREATOR (${CREATOR}) must be 0x + 40 hex" >&2
  exit 1
fi

echo "rpc       ${MONAD_RPC_URL} (chain ${CHAIN_ID})"
echo "deployer  ${DEPLOYER_ADDR} via ${SIGNER_KIND}"
BALANCE_MON="$(cast balance "${DEPLOYER_ADDR}" --ether --rpc-url "${MONAD_RPC_URL}" 2>/dev/null || echo "?")"
echo "balance   ${BALANCE_MON} MON"
if [ "${BALANCE_MON}" != "?" ] && awk -v b="${BALANCE_MON}" 'BEGIN { exit !(b + 0 < 10) }'; then
  echo "warning: deployer below 10 MON; the consensus gas budget is min(10 MON, balance) (docs/10-MONAD-NOTES.md)" >&2
fi
print_params

mkdir -p "${MAVERA_SCRIPTS_DIR}/out"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="${MAVERA_SCRIPTS_DIR}/out/deploy-${STAMP}.log"
echo "forge create ${CONTRACT} --root contracts --broadcast ... (log: ${LOG})"

# --constructor-args is variadic and therefore last. Output lines parsed below:
#   Deployer: 0x...   Deployed to: 0x...   Transaction hash: 0x...
set +e
forge create "${CONTRACT}" \
  --root "${CONTRACT_ROOT}" \
  --rpc-url "${MONAD_RPC_URL}" \
  "${SIGNER_ARGS[@]}" \
  --broadcast \
  --constructor-args \
    "${USDC_ADDRESS}" \
    "${CREATOR}" \
    "${SHARE_PRICE}" \
    "${MAX_SUPPLY}" \
    "${CREATOR_SHARES}" \
    "${TOKEN_NAME}" \
    "${TOKEN_SYMBOL}" \
    "${ENDPOINT}" 2>&1 | tee "${LOG}"
FORGE_STATUS=${PIPESTATUS[0]}
set -e
if [ "${FORGE_STATUS}" -ne 0 ]; then
  echo "error: forge create failed with status ${FORGE_STATUS} (see ${LOG})" >&2
  exit "${FORGE_STATUS}"
fi

ADDRESS="$(sed -n 's/^Deployed to: *//p' "${LOG}" | tail -1 | tr -d '[:space:]')"
TX_HASH="$(sed -n 's/^Transaction hash: *//p' "${LOG}" | tail -1 | tr -d '[:space:]')"
if ! is_address "${ADDRESS}"; then
  echo "error: could not parse 'Deployed to:' from the forge output (${LOG})" >&2
  exit 1
fi

cat <<EOF

Mavera deployed
  address      ${ADDRESS}
  tx           ${TX_HASH:-unknown}
  Monadscan    ${EXPLORER_URL}/address/${ADDRESS}
  tx link      ${EXPLORER_URL}/tx/${TX_HASH:-}
  MonadVision  ${MONADVISION_URL}/address/${ADDRESS}

Set these three lines in .env (then run \`pnpm env:link\` once and restart \`pnpm dev\`):
MAVERA_ADDRESS=${ADDRESS}
NEXT_PUBLIC_MAVERA_ADDRESS=${ADDRESS}
PAY_TO=${ADDRESS}

Next: ./scripts/verify.sh ${ADDRESS}
EOF

if [ "${UPDATE_ENV}" -eq 1 ]; then
  if [ ! -f "${ENV_FILE}" ]; then
    echo "error: --update-env: ${ENV_FILE} not found" >&2
    exit 1
  fi
  cp "${ENV_FILE}" "${ENV_FILE}.bak"
  for key in MAVERA_ADDRESS NEXT_PUBLIC_MAVERA_ADDRESS PAY_TO; do
    if grep -q "^${key}=" "${ENV_FILE}"; then
      sed -i.tmp "s|^${key}=.*|${key}=${ADDRESS}|" "${ENV_FILE}" && rm -f "${ENV_FILE}.tmp"
    else
      printf '%s=%s\n' "${key}" "${ADDRESS}" >>"${ENV_FILE}"
    fi
  done
  echo "updated ${ENV_FILE} (backup: ${ENV_FILE}.bak)"
fi

printf '%s %s %s\n' "${STAMP}" "${ADDRESS}" "${TX_HASH:-}" >>"${MAVERA_SCRIPTS_DIR}/out/deployments.txt"
