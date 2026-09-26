#!/usr/bin/env bash
# Prints the measured circuit cost table that appears in the README.
set -euo pipefail
ZKIR="${HOME}/.compact/versions/0.31.1/$(uname -m | sed 's/arm64/aarch64/')-darwin/zkir"
[ -x "$ZKIR" ] || ZKIR="$(find "${HOME}/.compact/versions/0.31.1" -name zkir -type f | head -1)"
[ -x "$ZKIR" ] || { echo "error: zkir not found; run 'npm run compile' first" >&2; exit 1; }
# Before a compile the globs below match nothing, and zkir would fail on the literal pattern.
for d in contracts/managed/zkir contracts/managed-host/zkir; do
  ls "$d"/*.zkir >/dev/null 2>&1 || { echo "error: no .zkir files in $d/; run 'npm run compile' first" >&2; exit 1; }
done

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
printf '| circuit | k | rows | prover key | zkir |\n|---|---|---|---|---|\n'
for f in contracts/managed/zkir/*.zkir contracts/managed-host/zkir/*.zkir; do
  n="$(basename "$f" .zkir)"
  # Read all of zkir's output, then parse it. Never `| head -1`: head exits after one line, zkir
  # then writes into a closed pipe (a lone "\r" on stderr), exits on EPIPE, and pipefail aborts the
  # table on a busy machine with no message although the measurement had been read. zkir writes
  # "k=…, rows=…" to stderr and a tracing line ("k: 14") to stdout, so match the pattern, not a line.
  out="$("$ZKIR" compile -v "$f" "$TMP/p" "$TMP/v" 2>&1)" || { echo "error: zkir failed on $f" >&2; printf '%s\n' "$out" >&2; exit 1; }
  [[ $out =~ k=([0-9]+),\ rows=([0-9]+) ]] || { echo "error: no k/rows for $f" >&2; exit 1; }
  k="${BASH_REMATCH[1]}"; rows="${BASH_REMATCH[2]}"
  d="$(dirname "$(dirname "$f")")"; sz="$(ls -lh "${d}/keys/${n}.prover" 2>/dev/null | awk '{print $5}' || true)"
  [ -n "$sz" ] || { echo "error: missing ${d}/keys/${n}.prover" >&2; exit 1; }
  ver="$(python3 -c "import json;d=json.load(open('$f'));v=d['version'];print(f\"v{v['major']}.{v['minor']}\")")"
  printf '| `%s` | %s | %s | %s | %s |\n' "$n" "$k" "$rows" "$sz" "$ver"
done
