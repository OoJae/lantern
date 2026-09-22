#!/usr/bin/env bash
# Compiles the Lantern contract with the EXACT pinned toolchain.
# Requires no Docker. Proving keys are generated here, never committed.
set -euo pipefail

COMPACT_VERSION="0.31.1"
SRC="contracts/src/lantern.compact"
OUT="contracts/managed"

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

rm -rf "${OUT}"
echo "==> compiling ${SRC} with compact ${COMPACT_VERSION}"
compact compile "+${COMPACT_VERSION}" "${SRC}" "${OUT}"

# The generated sourcemap references compiler-internal paths that do not ship,
# which makes vitest emit a spurious warning. Strip it.
find "${OUT}" -name '*.js.map' -delete
find "${OUT}" -name '*.js' -exec sed -i '' -e '/^\/\/# sourceMappingURL=/d' {} \; 2>/dev/null \
  || find "${OUT}" -name '*.js' -exec sed -i -e '/^\/\/# sourceMappingURL=/d' {} \;

echo "==> circuits built:"
ls -1 "${OUT}/zkir"/*.zkir 2>/dev/null | xargs -n1 basename | sed 's/\.zkir$//' | sed 's/^/    /'
