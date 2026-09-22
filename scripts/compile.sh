#!/usr/bin/env bash
# Compiles every contract with the EXACT pinned toolchain. Requires no Docker.
# Proving keys are generated here and never committed.
#
#   bash scripts/compile.sh                 shipped + adversarial targets
#   bash scripts/compile.sh --shipped-only  the product only
set -euo pipefail

COMPACT_VERSION="0.31.1"

SHIPPED=(
  "contracts/src/lantern.compact|contracts/managed"
  "contracts/src/host.compact|contracts/managed-host"
)

# DELIBERATELY INSECURE. Never deployed. Compiled only so `npm run attack` can
# break them. See contracts/adversarial/README.md.
ADVERSARIAL=(
  "contracts/adversarial/vulnerable-public-guardians.compact|contracts/managed-public-guardians"
  "contracts/adversarial/vulnerable-lantern-v0.compact|contracts/managed-lantern-v0"
)

command -v compact >/dev/null 2>&1 || {
  echo "error: 'compact' not found. Install the Compact developer tools, then:" >&2
  echo "         compact update ${COMPACT_VERSION}" >&2
  exit 1
}

# compact's version machinery calls the GitHub API, which rate-limits
# unauthenticated requests. Use a local gh token when one is available.
if [ -z "${GITHUB_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  GITHUB_TOKEN="$(gh auth token 2>/dev/null || true)"
  export GITHUB_TOKEN
fi

build() {
  local src="${1%%|*}" out="${1##*|}"
  rm -rf "${out}"
  echo "==> compiling ${src}"
  compact compile "+${COMPACT_VERSION}" "${src}" "${out}"
  # The generated sourcemap references compiler-internal paths that do not
  # ship, which makes vitest emit a spurious warning. Strip it.
  find "${out}" -name '*.js.map' -delete
  find "${out}" -name '*.js' -exec sed -i '' -e '/^\/\/# sourceMappingURL=/d' {} \; 2>/dev/null \
    || find "${out}" -name '*.js' -exec sed -i -e '/^\/\/# sourceMappingURL=/d' {} \;
}

for t in "${SHIPPED[@]}"; do build "$t"; done

if [ "${1:-}" != "--shipped-only" ]; then
  echo
  echo "############################################################"
  echo "#  ADVERSARIAL TARGETS -- DELIBERATELY INSECURE            #"
  echo "#  never deployed; compiled only so 'npm run attack' can   #"
  echo "#  break them. Do not copy these contracts.                #"
  echo "############################################################"
  for t in "${ADVERSARIAL[@]}"; do build "$t"; done
fi

echo
echo "==> circuits built with compact ${COMPACT_VERSION}"
