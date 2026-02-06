#!/usr/bin/env bash
set -euo pipefail

log() {
  printf "[%s] %s\n" "$(date +"%H:%M:%S")" "$1"
}

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

if [ ! -f "package.json" ]; then
  log "ERROR: package.json not found in $ROOT"
  exit 1
fi

if [ ! -f "wrangler.jsonc" ]; then
  log "ERROR: wrangler.jsonc not found in $ROOT"
  exit 1
fi

WRANGLER="npm exec -- wrangler"

log "Checking wrangler availability"
$WRANGLER --version >/dev/null

if ! grep -q '"account_id"' "wrangler.jsonc"; then
  log "ERROR: account_id missing in wrangler.jsonc"
  exit 1
fi

if ! grep -Eq '"binding"\s*:\s*"DB"' "wrangler.jsonc"; then
  log "ERROR: D1 binding DB missing in wrangler.jsonc"
  exit 1
fi

if grep -q 'REPLACE_WITH_D1_DATABASE_ID' "wrangler.jsonc"; then
  log "ERROR: D1 database_id is still placeholder. Update wrangler.jsonc with the real database_id."
  exit 1
fi

log "Applying remote D1 migrations"
npm run d1:migrate:remote

log "Checking secrets"
SECRETS_LIST="$($WRANGLER secret list 2>/dev/null || true)"

if ! echo "$SECRETS_LIST" | grep -q 'APP_SHARED_PIN'; then
  log "APP_SHARED_PIN missing. You will be prompted to enter it."
  $WRANGLER secret put APP_SHARED_PIN
fi

if ! echo "$SECRETS_LIST" | grep -q 'SESSION_SECRET'; then
  log "SESSION_SECRET missing. Generating and setting securely."
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | $WRANGLER secret put SESSION_SECRET
  else
    log "ERROR: openssl not found. Install openssl or set SESSION_SECRET manually."
    exit 1
  fi
fi

log "Deploying"
DEPLOY_LOG="$(mktemp -t simply-text-console-deploy-XXXX.log)"
set +e
npm run deploy 2>&1 | tee "$DEPLOY_LOG"
DEPLOY_STATUS=${PIPESTATUS[0]}
set -e
if [ "$DEPLOY_STATUS" -ne 0 ]; then
  log "ERROR: deploy failed"
  exit 1
fi

DEPLOY_URL="$(grep -Eo 'https?://[^ ]+' "$DEPLOY_LOG" | grep -E 'workers.dev|pages.dev' | head -n 1 || true)"
if [ -z "$DEPLOY_URL" ]; then
  DEPLOY_URL="$($WRANGLER deployments list 2>/dev/null | grep -Eo 'https?://[^ ]+' | head -n 1 || true)"
fi

if [ -z "$DEPLOY_URL" ]; then
  log "ERROR: Could not determine deploy URL"
  exit 1
fi

echo "$DEPLOY_URL" > .last_deploy_url

log "Smoke testing $DEPLOY_URL"
COOKIE_JAR="$(mktemp -t simply-text-console-cookie-XXXX.txt)"
SMOKE_RESULTS=()

code="$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOY_URL/api/health")"
if [ "$code" = "200" ]; then
  SMOKE_RESULTS+=("health:pass")
else
  SMOKE_RESULTS+=("health:fail")
fi

LOGIN_BODY="$(mktemp -t simply-text-console-login-XXXX.json)"
code="$(curl -s -o "$LOGIN_BODY" -w "%{http_code}" \
  -X POST "$DEPLOY_URL/api/login" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_JAR" \
  -d '{"workspaceCode":"simply","pin":"123456","displayName":"Deploy Smoke"}')"
if [ "$code" = "200" ]; then
  SMOKE_RESULTS+=("login:pass")
else
  SMOKE_RESULTS+=("login:fail")
fi

ME_BODY="$(mktemp -t simply-text-console-me-XXXX.json)"
code="$(curl -s -o "$ME_BODY" -w "%{http_code}" \
  -b "$COOKIE_JAR" \
  "$DEPLOY_URL/api/me")"
if [ "$code" = "200" ]; then
  SMOKE_RESULTS+=("me:pass")
else
  SMOKE_RESULTS+=("me:fail")
fi

DEV_MODE_ENABLED="false"
if grep -Eq '"DEV_MODE"\s*:\s*"true"' "wrangler.jsonc"; then
  DEV_MODE_ENABLED="true"
fi

if [ "$DEV_MODE_ENABLED" = "true" ]; then
  INBOUND_BODY="$(mktemp -t simply-text-console-inbound-XXXX.json)"
  code="$(curl -s -o "$INBOUND_BODY" -w "%{http_code}" \
    -X POST "$DEPLOY_URL/api/dev/inbound" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_JAR" \
    -d '{"fromPhone":"+14165551234","body":"Deploy smoke inbound"}')"
  if [ "$code" = "200" ]; then
    SMOKE_RESULTS+=("dev-inbound:pass")
  else
    SMOKE_RESULTS+=("dev-inbound:fail")
  fi
else
  SMOKE_RESULTS+=("dev-inbound:skipped")
fi

CONV_BODY="$(mktemp -t simply-text-console-conv-XXXX.json)"
code="$(curl -s -o "$CONV_BODY" -w "%{http_code}" \
  -b "$COOKIE_JAR" \
  "$DEPLOY_URL/api/conversations")"
if [ "$code" = "200" ]; then
  SMOKE_RESULTS+=("conversations:pass")
else
  SMOKE_RESULTS+=("conversations:fail")
fi

log "Summary"
log "URL: $DEPLOY_URL"
log "Results: ${SMOKE_RESULTS[*]}"
log "Next: open $DEPLOY_URL/app"
