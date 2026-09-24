#!/usr/bin/env bash
# npm run devnet [-- --quick]: preflight, build, start the local chain, run the story.
# With LANTERN_NETWORK=preprod the story runs on Midnight's public test network instead.
set -euo pipefail
cd "$(dirname "$0")"

node -e 'process.exit(+process.versions.node.split(".")[0] >= 24 ? 0 : 1)' \
  || { echo "devnet: needs Node >= 24 (found $(node --version))" >&2; exit 1; }
# Unset or empty means the local chain, as in src/config.mjs. Anything else but Preprod stops
# here, before anything is compiled or started.
case "${LANTERN_NETWORK:-undeployed}" in
  undeployed|preprod) ;;
  *) echo "devnet: LANTERN_NETWORK=${LANTERN_NETWORK}: use undeployed (the default, a local chain) or preprod" >&2; exit 1 ;;
esac
docker info >/dev/null 2>&1 || { echo "devnet: Docker is not running" >&2; exit 1; }
[ -d ../node_modules ] || { echo "devnet: run 'npm install' at the repo root first" >&2; exit 1; }
[ -d node_modules ] || npm ci --no-audit --no-fund

bash compile.sh
# On Preprod only the proof server, which always runs locally, is started here.
if [ "${LANTERN_NETWORK:-undeployed}" = "undeployed" ]; then
  echo "devnet: starting the local chain (node, indexer, proof server)…"
  docker compose -f compose.yml up -d --wait
else
  echo "devnet: ${LANTERN_NETWORK}: starting the local proof server only…"
  docker compose -f compose.yml up -d --wait proof-server
fi
# `run.sh bench`: prove the SHIPPED finalizeRecovery (72 h lock) without submitting it.
if [ "${1:-}" = "bench" ]; then shift; exec node src/bench.mjs "$@"; fi
exec node src/main.mjs "$@"
