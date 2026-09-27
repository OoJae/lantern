#!/usr/bin/env bash
# Prints the measured circuit cost table of Lantern v2 (docs/v2.md §8), the same
# way scripts/cost.sh does for v1. Needs `npm run compile:v2` first.
set -euo pipefail
ZKIR="${HOME}/.compact/versions/0.31.1/$(uname -m | sed 's/arm64/aarch64/')-darwin/zkir"
[ -x "$ZKIR" ] || ZKIR="$(find "${HOME}/.compact/versions/0.31.1" -name zkir -type f 2>/dev/null | head -1 || true)"
[ -x "$ZKIR" ] || { echo "error: zkir not found; run 'npm run compile:v2' first" >&2; exit 1; }
ls contracts/managed-lantern2/zkir/*.zkir >/dev/null 2>&1 || { echo "error: no v2 zkir; run 'npm run compile:v2' first" >&2; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
printf '| circuit | k | rows | prover key | zkir |\n|---|---|---|---|---|\n'
for f in contracts/managed-lantern2/zkir/*.zkir; do
  n="$(basename "$f" .zkir)"
  # Capture ALL of zkir's output, then parse it. Piping zkir into `head -1` could close
  # the pipe before zkir's last write (a lone "\r" on stderr); under load zkir then
  # exited on EPIPE, and pipefail aborted the table with no message.
  out="$("$ZKIR" compile -v "$f" "$TMP/p" "$TMP/v" 2>&1)" || { echo "error: zkir failed on $f" >&2; printf '%s\n' "$out" >&2; exit 1; }
  [[ $out =~ k=([0-9]+),\ rows=([0-9]+) ]] || { echo "error: no k/rows for $f" >&2; exit 1; }
  k="${BASH_REMATCH[1]}"; rows="${BASH_REMATCH[2]}"
  d="$(dirname "$(dirname "$f")")"; sz="$(ls -lh "${d}/keys/${n}.prover" 2>/dev/null | awk '{print $5}' || true)"
  [ -n "$sz" ] || { echo "error: missing ${d}/keys/${n}.prover" >&2; exit 1; }
  ver="$(python3 -c "import json;d=json.load(open('$f'));v=d['version'];print(f\"v{v['major']}.{v['minor']}\")")"
  printf '| `%s` | %s | %s | %s | %s |\n' "$n" "$k" "$rows" "$sz" "$ver"
done
