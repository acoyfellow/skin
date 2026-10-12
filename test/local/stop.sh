#!/usr/bin/env bash
PORT=${PORT:-8790}
for pid in $(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do kill "$pid" 2>/dev/null || true; done
if [ -f "$(dirname "$0")/dev.pid" ]; then kill "$(cat "$(dirname "$0")/dev.pid")" 2>/dev/null || true; fi
for _ in $(seq 1 20); do ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q . || exit 0; sleep 0.5; done
exit 0
