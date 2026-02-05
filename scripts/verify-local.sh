#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(pwd)"

log() {
  printf "[%s] %s\n" "$(date +"%H:%M:%S")" "$1"
}

find_repo_root() {
  local candidates=()
  while IFS= read -r -d '' file; do
    candidates+=("$file")
  done < <(find . -maxdepth 4 -name package.json -print0)

  if [ ${#candidates[@]} -eq 0 ]; then
    return 1
  fi

  local preferred=""
  for pkg in "${candidates[@]}"; do
    local dir
    dir="$(dirname "$pkg")"
    if [ "$(basename "$dir")" = "simply-text-console" ]; then
      preferred="$dir"
      break
    fi
  done

  if [ -n "$preferred" ]; then
    printf "%s" "$preferred"
    return 0
  fi

  printf "%s" "$(dirname "${candidates[0]}")"
  return 0
}

ROOT="$(find_repo_root || true)"
if [ -z "$ROOT" ]; then
  log "ERROR: Could not find package.json within depth 4 of $BASE_DIR"
  exit 1
fi

log "Using repo root: $ROOT"
cd "$ROOT"

if [ ! -f "package.json" ]; then
  log "ERROR: package.json not found in $ROOT"
  exit 1
fi

if [ -f ".dev.vars.example" ]; then
  log "Copying .dev.vars.example to .dev.vars"
  cp -f ".dev.vars.example" ".dev.vars"
else
  log "Creating .dev.vars with safe defaults"
  cat <<'VARS' > ".dev.vars"
APP_WORKSPACE_CODE=simply
APP_SHARED_PIN=123456
SESSION_SECRET=dev-only-session-secret-change-me
DEV_MODE=true
VARS
fi

log "Installing dependencies"
npm install

log "Checking available scripts"
SCRIPTS_JSON="$(node -e "const p=require('./package.json'); console.log(JSON.stringify(p.scripts||{}));")"

has_script() {
  local name="$1"
  node -e "const scripts=$SCRIPTS_JSON; process.exit(Object.prototype.hasOwnProperty.call(scripts,'$name')?0:1)"
}

SCRIPT_ORDER=(typecheck lint test build)
FOUND_SCRIPTS=()
MISSING_SCRIPTS=()
SCRIPT_RESULTS=()

for script in "${SCRIPT_ORDER[@]}"; do
  if has_script "$script"; then
    FOUND_SCRIPTS+=("$script")
  else
    MISSING_SCRIPTS+=("$script")
  fi
done

log "Found scripts: ${FOUND_SCRIPTS[*]:-none}"
log "Missing scripts: ${MISSING_SCRIPTS[*]:-none}"

for script in "${FOUND_SCRIPTS[@]}"; do
  log "Running npm run $script"
  if npm run "$script"; then
    SCRIPT_RESULTS+=("$script:pass")
  else
    SCRIPT_RESULTS+=("$script:fail")
  fi
done

if has_script "d1:migrate:local"; then
  log "Applying local D1 migrations"
  npm run d1:migrate:local
else
  log "Applying local D1 migrations via wrangler"
  npx wrangler d1 migrations apply DB --local
fi

log "Starting dev server (wrangler dev)"
DEV_LOG="$(mktemp -t simply-text-console-dev-XXXX.log)"
nohup npx wrangler dev --local --port 8787 > "$DEV_LOG" 2>&1 &
DEV_PID=$!

cleanup() {
  if ps -p "$DEV_PID" > /dev/null 2>&1; then
    log "Stopping dev server (PID $DEV_PID)"
    kill "$DEV_PID" || true
    sleep 1
    if ps -p "$DEV_PID" > /dev/null 2>&1; then
      log "Force killing dev server"
      kill -9 "$DEV_PID" || true
    fi
  fi
}
trap cleanup EXIT

log "Waiting for /api/health"
HEALTH_OK="false"
for i in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8787/api/health" || true)"
  if [ "$code" = "200" ]; then
    HEALTH_OK="true"
    break
  fi
  sleep 1
done

if [ "$HEALTH_OK" != "true" ]; then
  log "ERROR: /api/health did not become ready"
  log "Dev server log:"
  tail -n 40 "$DEV_LOG" || true
  exit 1
fi

COOKIE_JAR="$(mktemp -t simply-text-console-cookie-XXXX.txt)"
SMOKE_RESULTS=()

log "Smoke test 1: GET /api/health"
code="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8787/api/health")"
if [ "$code" = "200" ]; then
  SMOKE_RESULTS+=("health:pass")
else
  SMOKE_RESULTS+=("health:fail")
fi

log "Smoke test 2: POST /api/login"
LOGIN_BODY="$(mktemp -t simply-text-console-login-XXXX.json)"
code="$(curl -s -o "$LOGIN_BODY" -w "%{http_code}" \
  -X POST "http://127.0.0.1:8787/api/login" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_JAR" \
  -d '{"workspaceCode":"simply","pin":"123456","displayName":"Dev User"}')"
if [ "$code" = "200" ]; then
  SMOKE_RESULTS+=("login:pass")
else
  SMOKE_RESULTS+=("login:fail")
fi

log "Smoke test 3: GET /api/me"
ME_BODY="$(mktemp -t simply-text-console-me-XXXX.json)"
code="$(curl -s -o "$ME_BODY" -w "%{http_code}" \
  -b "$COOKIE_JAR" \
  "http://127.0.0.1:8787/api/me")"
if [ "$code" = "200" ]; then
  node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync('$ME_BODY','utf8'));if(!data.user||!data.user.workspace_id){process.exit(1)}" \
    && SMOKE_RESULTS+=("me:pass") || SMOKE_RESULTS+=("me:fail")
else
  SMOKE_RESULTS+=("me:fail")
fi

log "Smoke test 4: POST /api/dev/inbound"
INBOUND_BODY="$(mktemp -t simply-text-console-inbound-XXXX.json)"
code="$(curl -s -o "$INBOUND_BODY" -w "%{http_code}" \
  -X POST "http://127.0.0.1:8787/api/dev/inbound" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR" \
  -d '{"fromPhone":"+14165551234","body":"Test inbound"}')"
if [ "$code" = "200" ]; then
  SMOKE_RESULTS+=("dev-inbound:pass")
else
  SMOKE_RESULTS+=("dev-inbound:fail")
fi

log "Smoke test 5: GET /api/conversations"
CONV_BODY="$(mktemp -t simply-text-console-conv-XXXX.json)"
code="$(curl -s -o "$CONV_BODY" -w "%{http_code}" \
  -b "$COOKIE_JAR" \
  "http://127.0.0.1:8787/api/conversations")"
if [ "$code" = "200" ]; then
  node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync('$CONV_BODY','utf8'));if(!data.conversations||data.conversations.length<1){process.exit(1)}" \
    && SMOKE_RESULTS+=("conversations:pass") || SMOKE_RESULTS+=("conversations:fail")
else
  SMOKE_RESULTS+=("conversations:fail")
fi

log "Smoke tests done"

log "Summary"
log "Repo root: $ROOT"
log "Scripts run: ${SCRIPT_RESULTS[*]:-none}"
log "Smoke results: ${SMOKE_RESULTS[*]:-none}"
log "Next time run: cd \"$ROOT\" && npx wrangler dev --local --port 8787"
