#!/usr/bin/env bash
#
# Starts Postgres, waits for its healthcheck, then runs Nuxt.
# Ctrl+C stops Nuxt and the containers; the data volume is kept.

set -uo pipefail
cd "$(dirname "$0")/.."

NUXT_PID=""
BEENDET=0

aufraeumen() {
  # Clean up once; the trap can fire for both Ctrl+C and normal exit.
  [[ "$BEENDET" -eq 1 ]] && return
  BEENDET=1

  # Stop Nuxt before the database goes away.
  if [[ -n "$NUXT_PID" ]] && kill -0 "$NUXT_PID" 2>/dev/null; then
    kill -TERM "$NUXT_PID" 2>/dev/null
    for _ in $(seq 1 20); do
      kill -0 "$NUXT_PID" 2>/dev/null || break
      sleep 0.25
    done
    kill -KILL "$NUXT_PID" 2>/dev/null
  fi
  # npm child processes sometimes outlive npm.
  pkill -f "nuxt dev --dotenv" 2>/dev/null

  echo ""
  echo "Fahre Postgres herunter …"
  docker compose down --remove-orphans
}
trap aufraeumen EXIT INT TERM

echo "Starte Postgres …"
if ! docker compose up -d --wait; then
  echo "Postgres konnte nicht gestartet werden. Laeuft Docker Desktop?" >&2
  exit 1
fi

echo ""
echo "Nuxt startet auf http://localhost:3000 – Strg+C beendet alles."
echo ""

npm run dev &
NUXT_PID=$!

# A sleep loop instead of "wait", so Ctrl+C reaches the trap immediately.
while kill -0 "$NUXT_PID" 2>/dev/null; do
  sleep 0.5
done
