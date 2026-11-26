#!/usr/bin/env bash
# Runs SteuerEule on this machine. `scripts/local.sh help` lists the commands.
set -euo pipefail

cd "$(dirname "$0")/.."

PROD_STACK=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
DEV_STACK=(docker compose)
DEV_API_LOG=".local/api.log"

# Ports: an exported variable wins, then a value in .env, then the default (#114). Two checkouts can run side by
# side with e.g. `API_PORT=3100 WEB_PORT=8180 DEV_WEB_PORT=8181 MAILPIT_PORT=8125 POSTGRES_PORT=5532 scripts/local.sh dev`.
# docker-compose reads the same names (docker-compose*.yml), so the containers and these URLs cannot disagree.
setting() { # setting NAME DEFAULT
  local value="${!1:-}"
  if [[ -z "$value" && -f .env ]]; then value="$(sed -n "s/^$1=//p" .env | tail -n 1)"; fi
  printf '%s' "${value:-$2}"
}
API_PORT="$(setting API_PORT 3000)"
WEB_PORT="$(setting WEB_PORT 8080)"
DEV_WEB_PORT="$(setting DEV_WEB_PORT 8081)"
MAILPIT_PORT="$(setting MAILPIT_PORT 8025)"
export API_PORT WEB_PORT MAILPIT_PORT
POSTGRES_PORT="$(setting POSTGRES_PORT '')"
if [[ -n "$POSTGRES_PORT" ]]; then export POSTGRES_PORT; fi
API_URL="http://localhost:${API_PORT}"
WEB_URL="http://localhost:${WEB_PORT}"
DEV_WEB_URL="http://localhost:${DEV_WEB_PORT}"
INBOX_URL="http://localhost:${MAILPIT_PORT}"

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

# Mail goes to the local inbox over TLS only: Mailpit needs its certificate before it starts (scripts/mail-tls.sh).
# A new certificate also needs a new Mailpit container, which loads it at start (its inbox lives in memory only).
require_mail_tls() {
  command -v openssl >/dev/null 2>&1 || fail "openssl fehlt (für das TLS-Zertifikat des lokalen Postfachs)."
  local output
  output="$(scripts/mail-tls.sh)"
  if [[ -n "$output" ]]; then
    info "Neues TLS-Zertifikat für das lokale Postfach"
    "${DEV_STACK[@]}" rm --stop --force mailpit >/dev/null
  fi
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
  require_mail_tls
  info "Stack bauen und starten (das erste Mal dauert ein paar Minuten)"
  "${PROD_STACK[@]}" up --build -d
  wait_for "$API_URL/v1/health/ready" "API"
  wait_for "$WEB_URL/" "Web-App"
  printf '\n%sLäuft.%s\n  Web:      %s\n  API:      %s\n  Postfach: %s\n' "$BOLD" "$RESET" "$WEB_URL" "$API_URL" "$INBOX_URL"
  printf '  Stoppen:  scripts/local.sh down\n\n'
  open_in_browser "$WEB_URL"
}

cmd_dev() {
  require_docker
  require_pnpm_install
  require_mail_tls
  info "Postgres, Redis und Postfach starten"
  "${DEV_STACK[@]}" up -d --wait postgres mailpit redis
  local pg_port
  pg_port="$("${DEV_STACK[@]}" port postgres 5432 | sed 's/.*://')"

  local pg_user=steuereule pg_password=steuereule pg_db=steuereule
  export DATABASE_URL="postgresql://${pg_user}:${pg_password}@localhost:${pg_port}/${pg_db}"
  export PORT="$API_PORT"
  export BETTER_AUTH_URL="$API_URL"
  export CORS_ALLOWED_ORIGINS="$DEV_WEB_URL"
  export WEB_APP_URL="$DEV_WEB_URL"
  export EMAIL_DELIVERY=smtp
  export SMTP_URL="smtps://127.0.0.1:1025"
  export SMTP_CA_CERT="$PWD/.local/mail-tls/ca/ca.pem"
  # Same path as production: Redis for the answer runs and the rate limiter. An empty REDIS_URL
  # in the environment (or .env) switches back to in-process.
  local redis_port
  redis_port="$("${DEV_STACK[@]}" port redis 6379 | sed 's/.*://')"
  export REDIS_URL="${REDIS_URL-redis://localhost:${redis_port}}"

  info "Migrationen anwenden"
  pnpm --filter @steuereule/api migrate:deploy >/dev/null

  # Adresssuche (ADR-0065): Straßendaten einmalig laden (~55 MB). Ohne sie läuft alles, nur die Suche fehlt.
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
  wait_for "$API_URL/v1/health/ready" "API"

  info "Postfach für Bestätigungsmails: $INBOX_URL"
  info "Web-App mit Hot Reload starten ($DEV_WEB_URL, Strg-C beendet beides)"
  EXPO_NO_TYPESCRIPT_SETUP=1 EXPO_PUBLIC_API_BASE_URL="$API_URL" pnpm --filter @steuereule/mobile-web web --port "$DEV_WEB_PORT"
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
           Web http://localhost:8080 · API http://localhost:3000 (Ports: API_PORT, WEB_PORT)
  dev      Zum Entwickeln: Postgres im Container, API lokal, Web mit Hot Reload
           Web http://localhost:8081 · API http://localhost:3000 (Ports: DEV_WEB_PORT, API_PORT)
  mail     Lokales Postfach öffnen (alle Mails der App, http://localhost:8025, Port: MAILPIT_PORT)
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
