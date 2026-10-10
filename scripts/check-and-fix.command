#!/bin/bash
# Double-click this file (in Finder) to start the services and check them.
# It writes everything it finds to scripts/check-log.txt.
cd "$(dirname "$0")/.." || exit 1
LOG="$PWD/scripts/check-log.txt"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.orbstack/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
{
  echo "== $(date)"
  docker --version; docker compose version
  echo; echo "== Containers before"; docker compose ps -a
  echo; echo "== Who is listening on 5432 / 55432 / 3100"
  lsof -nP -iTCP:5432 -sTCP:LISTEN; lsof -nP -iTCP:55432 -sTCP:LISTEN; lsof -nP -iTCP:3100 -sTCP:LISTEN
  echo; echo "== Starting / updating services"; docker compose up -d 2>&1
  sleep 8
  echo; echo "== Containers after"; docker compose ps -a
  echo; echo "== Postgres port"; docker compose port postgres 5432
  echo; echo "== Postgres log"; docker compose logs --tail 25 postgres 2>&1
  echo; echo "== n8n log"; docker compose logs --tail 25 n8n 2>&1
  echo; echo "== DONE"
} > "$LOG" 2>&1
echo "Finished. Results are in scripts/check-log.txt. You can close this window."
