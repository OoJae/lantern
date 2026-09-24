#!/usr/bin/env bash
# Compiles every contract with the EXACT pinned toolchain. Requires no Docker.
# Proving keys are generated here and never committed.
#
#   bash scripts/compile.sh                 shipped + adversarial targets, with keys
#   bash scripts/compile.sh --shipped-only  the product only
#   bash scripts/compile.sh --check         seconds: recompile without keys into a scratch
#                                           directory and fail if any committed module differs
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

# The pinned compiler must be installed; a newer default would produce modules for a
# different runtime than the committed ones (compact-runtime 0.16.0).
compact compile "+${COMPACT_VERSION}" --version 2>/dev/null | grep -qx "${COMPACT_VERSION}" || {
  echo "error: compact ${COMPACT_VERSION} is not installed. Run: compact update ${COMPACT_VERSION}" >&2
  exit 1
}

# compact's version machinery calls the GitHub API, which rate-limits unauthenticated
# requests. If GITHUB_TOKEN is unset and the GitHub CLI is logged in, pass its token to
# compact for this run only. Never export an empty token.
if [ -z "${GITHUB_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  t="$(gh auth token 2>/dev/null || true)"
  if [ -n "$t" ]; then export GITHUB_TOKEN="$t"; fi
fi

# The generated sourcemap references compiler-internal paths that do not ship, which
# makes vitest emit a spurious warning. Strip it. perl behaves the same on macOS and
# Linux (sed -i does not, and a failure inside find -exec would be silent).
strip_maps() {
  find "$1" -name '*.js.map' -delete
  find "$1" -name '*.js' -exec perl -i -ne 'print unless m{^//# sourceMappingURL=}' {} +
}

build() {
  local src="${1%%|*}" out="${1##*|}"
  rm -rf "${out}"
  echo "==> compiling ${src}"
  compact compile "+${COMPACT_VERSION}" "${src}" "${out}"
  strip_maps "${out}"
}

if [ "${1:-}" = "--check" ]; then
  scratch="$(mktemp -d)"; trap 'rm -rf "$scratch"' EXIT
  status=0
  for t in "${SHIPPED[@]}" "${ADVERSARIAL[@]}"; do
    src="${t%%|*}" out="${t##*|}"
    compact compile "+${COMPACT_VERSION}" --skip-zk "${src}" "${scratch}/${out}" >/dev/null
    strip_maps "${scratch}/${out}"
    if diff -r "${scratch}/${out}/contract" "${out}/contract" >/dev/null; then
      echo "ok    ${src} compiles, and ${out}/contract matches it byte for byte"
    else
      echo "DRIFT ${src}: ${out}/contract differs from a fresh compile" >&2
      diff -r "${scratch}/${out}/contract" "${out}/contract" | head -20 >&2
      status=1
    fi
  done
  exit $status
fi

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
