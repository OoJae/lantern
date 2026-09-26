#!/usr/bin/env bash
# Builds everything the local chain runs, into devnet/build/ (gitignored). Never writes to
# contracts/: the committed modules stay exactly what `npm test` and CI check.
#
#   devnet/build/lantern   the devnet flavour (flavour.mjs: a 60 s timelock, one line changed)
#   devnet/build/host      the independently deployed host, unchanged
#   devnet/build/shipped   the shipped lantern.compact, so verify can show every other
#                          circuit's verifier key is identical to the shipped build's
#
# `compile.sh --v2` builds Lantern v2 alone, instead of the three above:
#
#   devnet/build/lantern2  contracts/v2/lantern2.compact, unchanged (no flavour: v2's delay is
#                          chosen at enrolment, and 24 h is its minimum), with its proving keys.
#                          devnet/src/v2-run.mjs deploys it; verify-v2.mjs compares the chain's
#                          verifier keys with it
#
# Each mode has its own stamp, so neither rebuilds, or touches, the other's builds.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPACT_VERSION="0.31.1"
command -v compact >/dev/null 2>&1 || { echo "devnet: 'compact' not found. Install the Compact tools, then: compact update ${COMPACT_VERSION}" >&2; exit 1; }
# Pass a logged-in GitHub CLI's token to compact (rate limits); never export an empty one.
if [ -z "${GITHUB_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  t="$(gh auth token 2>/dev/null || true)"; if [ -n "$t" ]; then export GITHUB_TOKEN="$t"; fi
fi

# shasum comes with perl (macOS, most Linux); a minimal Linux image may have only coreutils' sha256sum.
sha256() { if command -v shasum >/dev/null 2>&1; then shasum -a 256; else sha256sum; fi; }

if [ "${1:-}" = "--v2" ]; then
  # v2 imports identity.compact and ownergate.compact from contracts/src: both are in its stamp.
  stamp2="$(cat contracts/v2/*.compact contracts/src/identity.compact contracts/src/ownergate.compact devnet/compile.sh | sha256 | cut -d' ' -f1)"
  if [ -f devnet/build/.stamp-v2 ] && [ "$(cat devnet/build/.stamp-v2)" = "$stamp2" ] && [ -d devnet/build/lantern2/keys ]; then
    echo "devnet: v2 build is current"; exit 0
  fi
  # As below: the stamp is written only once the build has succeeded.
  rm -f devnet/build/.stamp-v2
  mkdir -p devnet/build
  echo "devnet: compiling contracts/v2/lantern2.compact -> devnet/build/lantern2"
  rm -rf devnet/build/lantern2
  compact compile "+${COMPACT_VERSION}" contracts/v2/lantern2.compact devnet/build/lantern2 >/dev/null \
    || { echo "devnet: the v2 compile failed (see compact's errors above); devnet/build/lantern2 is incomplete" >&2; exit 1; }
  echo "$stamp2" > devnet/build/.stamp-v2
  echo "devnet: v2 built with compact ${COMPACT_VERSION}"
  exit 0
fi

stamp="$(cat contracts/src/*.compact devnet/flavour.mjs devnet/compile.sh | sha256 | cut -d' ' -f1)"
if [ -f devnet/build/.stamp ] && [ "$(cat devnet/build/.stamp)" = "$stamp" ] \
   && [ -d devnet/build/lantern/keys ] && [ -d devnet/build/host/keys ] && [ -d devnet/build/shipped/keys ]; then
  echo "devnet: build is current"; exit 0
fi

# No stamp survives a rebuild that fails or is interrupted part-way: it is written only at the end.
rm -f devnet/build/.stamp
node devnet/flavour.mjs
build() {
  echo "devnet: compiling $1 -> $2"
  rm -rf "$2"
  compact compile "+${COMPACT_VERSION}" "$1" "$2" >/dev/null
}
build devnet/build/src/lantern.compact devnet/build/lantern & p1=$!
build contracts/src/host.compact devnet/build/host & p2=$!
build contracts/src/lantern.compact devnet/build/shipped & p3=$!
# A bare `wait` returns 0 whatever the builds returned: wait for each (so none is left running),
# then stop if any failed, before the stamp is written.
failed=0
for p in "$p1" "$p2" "$p3"; do wait "$p" || failed=1; done
[ "$failed" = 0 ] || { echo "devnet: a compile failed (see compact's errors above); devnet/build is incomplete" >&2; exit 1; }
echo "$stamp" > devnet/build/.stamp
echo "devnet: built with compact ${COMPACT_VERSION}"
