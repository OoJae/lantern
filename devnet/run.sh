#!/usr/bin/env bash
# npm run devnet [-- --quick]: preflight, build, start the local chain, run the story.
set -euo pipefail
cd "$(dirname "$0")"

node -e 'process.exit(+process.versions.node.split(".")[0] >= 24 ? 0 : 1)' \
  || { echo "devnet: needs Node >= 24 (found $(node --version))" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "devnet: Docker is not running" >&2; exit 1; }
[ -d ../node_modules ] || { echo "devnet: run 'npm install' at the repo root first" >&2; exit 1; }
[ -d node_modules ] || npm ci --no-audit --no-fund

bash compile.sh
echo "devnet: starting the local chain (node, indexer, proof server)…"
docker compose -f compose.yml up -d --wait
exec node src/main.mjs "$@"
