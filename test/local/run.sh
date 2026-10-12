#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/../.."
PORT=${PORT:-8790}
node scripts/seed.mjs >/dev/null
rm -rf test/local/.state
npx wrangler dev -c test/local/wrangler.jsonc --port "$PORT" --persist-to test/local/.state > test/local/dev.log 2>&1 &
echo $! > test/local/dev.pid
for _ in $(seq 1 90); do curl -s -o /dev/null "localhost:$PORT/_kernel/icon.svg" && break; sleep 1; done
echo "ready on $PORT"
