#!/usr/bin/env bash
# Runs SteuerEule on this machine. `scripts/local.sh help` lists the commands.
set -euo pipefail

cd "$(dirname "$0")/.."

PROD_STACK=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
DEV_STACK=(docker compose)
DEV_API_LOG=".local/api.log"
INBOX_URL="http://localhost:8025"

if [[ -t 1 ]]; then BOLD=$'\e[1m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'; else BOLD=""; GREEN=""; YELLOW=""; RESET=""; fi
info() { printf '%s▸%s %s\n' "$GREEN" "$RESET" "$1"; }
fail() { printf '%s✗ %s%s\n' "$YELLOW" "$1" "$RESET" >&2; exit 1; }

open_in_browser() {
  if command -v open >/dev/null 2>&1; then open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1
  fi
}

require_docker() {
  command -v docker >/dev/null 2>&1 || fail "Docker fehlt. Installiere Docker Desktop oder colima."
  docker info >/dev/null 2>&1 || fail "Docker läuft nicht. Starte Docker Desktop oder 'colima start'."
}

require_pnpm_install() {
  command -v pnpm >/dev/null 2>&1 || fail "pnpm fehlt: 'corepack enable'."
  [[ -d node_modules ]] || { info "Abhängigkeiten installieren"; pnpm install --frozen-lockfile; }
}

wait_for() {
  local url="$1" label="$2"
  info "Warte auf $label"
  for _ in $(seq 1 90); do
    curl -fsS -o /dev/null "$url" 2>/dev/null && return 0
    sleep 2
  done
  fail "$label antwortet nicht ($url). Logs: scripts/local.sh logs"
}

cmd_up() {
  require_docker
  if [[ ! -f .env ]]; then
    cp .env.example .env
    info ".env aus .env.example angelegt"
  fi
  info "Stack bauen und starten (das erste Mal dauert ein paar Minuten)"
  "${PROD_STACK[@]}" up --build -d
  wait_for "http://localhost:3000/v1/health/ready" "API"
  wait_for "http://localhost:8080/" "Web-App"
  printf '\n%sLäuft.%s\n  Web:      http://localhost:8080\n  API:      http://localhost:3000\n  Postfach: %s\n' "$BOLD" "$RESET" "$INBOX_URL"
  printf '  Stoppen:  scripts/local.sh down\n\n'
  open_in_browser "http://localhost:8080"
}

cmd_dev() {
  require_docker
  require_pnpm_install
  info "Postgres und Postfach starten"
  "${DEV_STACK[@]}" up -d --wait postgres mailpit
  local pg_port
  pg_port="$("${DEV_STACK[@]}" port postgres 5432 | sed 's/.*://')"

  export DATABASE_URL="postgresql://steuereule:steuereule@localhost:${pg_port}/steuereule"
  export PORT=3000
  export BETTER_AUTH_URL="http://localhost:3000"
  export CORS_ALLOWED_ORIGINS="http://localhost:8081"
  export WEB_APP_URL="http://localhost:8081"
  export EMAIL_DELIVERY=smtp
  export SMTP_URL="smtp://127.0.0.1:1025"

  info "Migrationen anwenden"
  pnpm --filter @steuereule/api migrate:deploy >/dev/null

  # Adresssuche (ADR-0064): Straßendaten einmalig laden (~55 MB). Ohne sie läuft alles, nur die Suche fehlt.
  export STREET_DATA_PATH="$PWD/apps/api/data/streets.csv"
  if [[ ! -f "$STREET_DATA_PATH" ]]; then
    info "Straßendaten für die Adresssuche laden (einmalig, ~55 MB)"
    pnpm --filter @steuereule/api streets:fetch >/dev/null || info "Straßendaten nicht geladen – die Adresssuche bleibt aus."
  fi

  info "API bauen und starten (Log: $DEV_API_LOG)"
  mkdir -p "$(dirname "$DEV_API_LOG")"
  pnpm --filter @steuereule/api build >/dev/null
  (cd apps/api && exec node --import tsx dist/main.js) >"$DEV_API_LOG" 2>&1 &
  local api_pid=$!
  trap 'kill "$api_pid" 2>/dev/null || true' EXIT INT TERM
  wait_for "http://localhost:3000/v1/health/ready" "API"

  info "Postfach für Bestätigungsmails: $INBOX_URL"
  info "Web-App mit Hot Reload starten (http://localhost:8081, Strg-C beendet beides)"
  EXPO_NO_TYPESCRIPT_SETUP=1 EXPO_PUBLIC_API_BASE_URL="http://localhost:3000" pnpm --filter @steuereule/mobile-web web
}

cmd_down() {
  require_docker
  "${PROD_STACK[@]}" down
  info "Gestoppt. Daten bleiben erhalten; 'scripts/local.sh reset' löscht sie."
}

cmd_logs() {
  require_docker
  "${PROD_STACK[@]}" logs -f --tail 100 "${@:-api}"
}

cmd_mail() {
  curl -fsS -o /dev/null "$INBOX_URL" 2>/dev/null || fail "Postfach läuft nicht. Erst 'scripts/local.sh up' oder 'dev'."
  info "Postfach: $INBOX_URL"
  open_in_browser "$INBOX_URL"
}

cmd_reset() {
  require_docker
  printf '%sLöscht die lokale Datenbank mit allen Testdaten. Fortfahren? [y/N]%s ' "$YELLOW" "$RESET"
  local reply=""; read -r reply || true
  [[ "$reply" =~ ^[Yy] ]] || { info "Abgebrochen."; return; }
  "${PROD_STACK[@]}" down -v
  info "Datenbank gelöscht. Neu starten mit 'scripts/local.sh up'."
}

cmd_status() {
  require_docker
  "${PROD_STACK[@]}" ps
}

cmd_help() {
  cat <<HELP
${BOLD}scripts/local.sh${RESET} <befehl>

  up       Alles in Containern starten, wie in Produktion (Standard)
           Web http://localhost:8080 · API http://localhost:3000
  dev      Zum Entwickeln: Postgres im Container, API lokal, Web mit Hot Reload
           Web http://localhost:8081 · API http://localhost:3000
  mail     Lokales Postfach öffnen (alle Mails der App, http://localhost:8025)
  logs     API-Logs mitlesen (oder: logs web, logs postgres)
  status   Laufende Container anzeigen
  down     Alles stoppen, Daten bleiben
  reset    Alles stoppen und die lokale Datenbank löschen
HELP
}

command="${1:-up}"
shift || true
case "$command" in
  up|dev|down|logs|mail|reset|status|help) "cmd_$command" "$@" ;;
  -h|--help) cmd_help ;;
  *) cmd_help; exit 1 ;;
esac
