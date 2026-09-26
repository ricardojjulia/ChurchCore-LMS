#!/usr/bin/env bash
# COUNCIL-2026-031 — run the full browser + API suite locally, the way CI does.
#
#   npm run test:suite:local                    # everything
#   npm run test:suite:local -- --project=api   # extra args go to Playwright
#   SKIP_BUILD=1 npm run test:suite:local       # reuse the last .next build
#
# Requires a running local stack (`supabase start`). Writes .env.suite.local
# (gitignored) from `supabase status`, creates/refreshes the seeded users,
# re-seeds both test orgs, builds, serves on :3100, runs Playwright, and stops
# the server. It never reads .env.local / .env.test.local, and refuses to run
# against anything but a local Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${SUITE_PORT:-3100}"
eval "$(supabase status --output env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|DB_URL|JWT_SECRET)=')" || true
case "${API_URL:-}" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Local Supabase is not running (supabase start), or API_URL is not local: '${API_URL:-}'" >&2; exit 1 ;;
esac

if [[ ! -f .env.suite.local ]] || ! grep -q "^TEST_SUPABASE_URL=$API_URL$" .env.suite.local; then
  umask 077
  cat > .env.suite.local <<EOF
TEST_SUPABASE_URL=$API_URL
TEST_SUPABASE_ANON_KEY=$ANON_KEY
TEST_SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
TEST_DATABASE_URL=$DB_URL
SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
TEST_USER_PASSWORD=$(openssl rand -base64 24)
EOF
fi
set -a; . ./.env.suite.local; set +a
export APP_BASE_URL="http://127.0.0.1:$PORT" NEXT_PUBLIC_DEMO_MODE=true
# Cloudflare's documented always-pass Turnstile test keys (public, not secrets).
export NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
# Deliberately invalid provider keys: routes get past "not configured" checks so
# auth/validation are exercised; upstream calls fail fast (asserted as 502).
export SUPABASE_JWT_SECRET="$JWT_SECRET"  # signs guardian unsubscribe tokens
export OPENAI_API_KEY=sk-suite-invalid ANTHROPIC_API_KEY=suite-invalid CRON_SECRET=suite-cron-secret

supabase migration up >/dev/null
node scripts/ci-setup-test-env.mjs >/dev/null
psql "$TEST_DATABASE_URL" -q -v ON_ERROR_STOP=1 -f supabase/seed.test.sql >/dev/null
psql "$TEST_DATABASE_URL" -q -v ON_ERROR_STOP=1 -f supabase/seed.suite.sql >/dev/null
echo "Seeded local stack at $API_URL"

# Edge Functions, served like CI with a suite-only env (CRON_SECRET etc.).
FN_ENV="${TMPDIR:-/tmp}/churchcore-suite-functions.env"
printf 'CRON_SECRET=%s\nSUPABASE_JWT_SECRET=%s\n' "$CRON_SECRET" "$JWT_SECRET" > "$FN_ENV"
supabase functions serve --env-file "$FN_ENV" > "${TMPDIR:-/tmp}/churchcore-suite-functions.log" 2>&1 &
FN_PID=$!

[[ "${SKIP_BUILD:-}" == 1 ]] || npm run build >/dev/null
npx next start --hostname 127.0.0.1 --port "$PORT" > "${TMPDIR:-/tmp}/churchcore-suite-app.log" 2>&1 &
APP_PID=$!
trap 'kill $APP_PID $FN_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -fs -o /dev/null "$APP_BASE_URL/login" && break; sleep 1; done
for _ in $(seq 1 60); do
  curl -fs -o /dev/null -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" "$API_URL/functions/v1/system-health-check" && break
  sleep 1
done

DEFAULT_PROJECTS=(--project=setup --project=api --project=browser --project=mobile)
[[ " $* " == *" --project"* ]] && DEFAULT_PROJECTS=()
npx playwright test -c tests/playwright/playwright.config.ts ${DEFAULT_PROJECTS[@]+"${DEFAULT_PROJECTS[@]}"} "$@"
