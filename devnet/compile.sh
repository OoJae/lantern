#!/usr/bin/env bash
# Builds everything the local chain runs, into devnet/build/ (gitignored). Never writes to
# contracts/: the committed modules stay exactly what `npm test` and CI check.
#
#   devnet/build/lantern   the devnet flavour (flavour.mjs: a 60 s timelock, one line changed)
#   devnet/build/host      the independently deployed host, unchanged
#   devnet/build/shipped   the shipped lantern.compact, so verify can show every other
#                          circuit's verifier key is identical to the shipped build's
set -euo pipefail
cd "$(dirname "$0")/.."

COMPACT_VERSION="0.31.1"
command -v compact >/dev/null 2>&1 || { echo "devnet: 'compact' not found. Install the Compact tools, then: compact update ${COMPACT_VERSION}" >&2; exit 1; }
# Pass a logged-in GitHub CLI's token to compact (rate limits); never export an empty one.
if [ -z "${GITHUB_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  t="$(gh auth token 2>/dev/null || true)"; if [ -n "$t" ]; then export GITHUB_TOKEN="$t"; fi
fi

stamp="$(cat contracts/src/*.compact devnet/flavour.mjs devnet/compile.sh | shasum -a 256 | cut -d' ' -f1)"
if [ -f devnet/build/.stamp ] && [ "$(cat devnet/build/.stamp)" = "$stamp" ] \
   && [ -d devnet/build/lantern/keys ] && [ -d devnet/build/host/keys ] && [ -d devnet/build/shipped/keys ]; then
  echo "devnet: build is current"; exit 0
fi

node devnet/flavour.mjs
build() {
  echo "devnet: compiling $1 -> $2"
  rm -rf "$2"
  compact compile "+${COMPACT_VERSION}" "$1" "$2" >/dev/null
}
build devnet/build/src/lantern.compact devnet/build/lantern &
build contracts/src/host.compact devnet/build/host &
build contracts/src/lantern.compact devnet/build/shipped &
wait
echo "$stamp" > devnet/build/.stamp
echo "devnet: built with compact ${COMPACT_VERSION}"
