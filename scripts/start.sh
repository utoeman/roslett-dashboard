#!/usr/bin/env bash
#
# Startet die vollstaendige Entwicklungsumgebung und raeumt sie wieder ab.
#
# Ablauf: Postgres hochfahren, auf den Healthcheck warten, dann Nuxt starten.
# Das Warten ist noetig, weil Docker den Container sofort als gestartet
# meldet, Postgres aber erst Sekunden spaeter Verbindungen annimmt.
#
# Strg+C beendet Nuxt und stoppt anschliessend auch die Container. Das
# Datenvolume bleibt erhalten – "docker compose down" entfernt nur Container
# und Netzwerk, nicht die Daten.

set -uo pipefail
cd "$(dirname "$0")/.."

NUXT_PID=""
BEENDET=0

aufraeumen() {
  # Nur einmal aufraeumen: die Falle greift sowohl bei Strg+C als auch beim
  # regulaeren Ende, und beides kann kurz hintereinander eintreten.
  [[ "$BEENDET" -eq 1 ]] && return
  BEENDET=1

  # Nuxt zuerst beenden, damit es keine Verbindungen mehr aufbaut, waehrend
  # die Datenbank verschwindet. Im Terminal hat Strg+C den Prozess meist
  # schon getroffen; laeuft er noch, holen wir das hier nach.
  if [[ -n "$NUXT_PID" ]] && kill -0 "$NUXT_PID" 2>/dev/null; then
    kill -TERM "$NUXT_PID" 2>/dev/null
    for _ in $(seq 1 20); do
      kill -0 "$NUXT_PID" 2>/dev/null || break
      sleep 0.25
    done
    kill -KILL "$NUXT_PID" 2>/dev/null
  fi
  # Kindprozesse von npm ueberleben dessen Ende gelegentlich.
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

# Nicht "wait" verwenden: es blockiert die Signalzustellung, solange ein
# Kindprozess laeuft. Die Schleife laesst Bash zwischen den Durchgaengen
# Signale verarbeiten, sodass Strg+C sofort in der Falle landet.
while kill -0 "$NUXT_PID" 2>/dev/null; do
  sleep 0.5
done
