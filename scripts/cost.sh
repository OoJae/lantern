#!/usr/bin/env bash
# Prints the measured circuit cost table that appears in the README.
set -euo pipefail
ZKIR="${HOME}/.compact/versions/0.31.1/$(uname -m | sed 's/arm64/aarch64/')-darwin/zkir"
[ -x "$ZKIR" ] || ZKIR="$(find "${HOME}/.compact/versions/0.31.1" -name zkir -type f | head -1)"
[ -x "$ZKIR" ] || { echo "error: zkir not found; run 'npm run compile' first" >&2; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
printf '| circuit | k | rows | prover key | zkir |\n|---|---|---|---|---|\n'
for f in contracts/managed/zkir/*.zkir; do
  n="$(basename "$f" .zkir)"
  line="$("$ZKIR" compile -v "$f" "$TMP/p" "$TMP/v" 2>&1 | head -1)"
  k="$(printf '%s' "$line" | grep -oE 'k=[0-9]+' | cut -d= -f2)"
  rows="$(printf '%s' "$line" | grep -oE 'rows=[0-9]+' | head -1 | cut -d= -f2)"
  sz="$(ls -lh "contracts/managed/keys/${n}.prover" 2>/dev/null | awk '{print $5}')"
  ver="$(python3 -c "import json;d=json.load(open('$f'));v=d['version'];print(f\"v{v['major']}.{v['minor']}\")")"
  printf '| `%s` | %s | %s | %s | %s |\n' "$n" "$k" "$rows" "$sz" "$ver"
done
