#!/usr/bin/env bash
set -u
cd "$(dirname "$0")"
PORT=${PORT:-8799}
rm -rf .wrangler/state
npx wrangler dev --port "$PORT" > dev.log 2>&1 &
DEV=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "localhost:$PORT/__ping" && break; sleep 1; done
for mode in "$@"; do
	curl -s -m 280 "localhost:$PORT/?mode=$mode" | head -c 1500
	echo
done
kill "$DEV" 2>/dev/null
wait "$DEV" 2>/dev/null
grep -iE 'error|crash|uncaught' dev.log | grep -v 'experimental' | head -5
exit 0
