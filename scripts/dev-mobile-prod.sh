#!/usr/bin/env bash
# One-command mobile launcher for testing against PRODUCTION (Railway + Supabase).
# - Does NOT touch anything/apps/mobile/.env. The production URL is exported as
#   shell env vars scoped to this one `expo start` invocation only, so it can
#   never persist into local-dev .env and the next regular dev-mobile.sh run
#   silently reverts back to local with no leftover state.
# - Does NOT start scripts/dev-backend.sh — the whole point is skipping the
#   local backend and hitting Railway directly.
# - Always runs with -c (clear Metro cache): EXPO_PUBLIC_* values are inlined
#   at start/build time, so a stale cache would silently keep serving whatever
#   backend URL was baked in last time.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$REPO_ROOT/anything/apps/mobile"

PROD_URL="https://pawpi-production.up.railway.app"
PROD_HOST="pawpi-production.up.railway.app"

echo ""
echo "⚠️  ⚠️  ⚠️   POINTED AT PRODUCTION   ⚠️  ⚠️  ⚠️"
echo "This Metro session talks to the LIVE Railway backend + Supabase database:"
echo "    $PROD_URL"
echo "Use the seeded demo account ONLY (demo@pawpi.app). This is real, live data —"
echo "any other account's writes are permanent production writes."
echo "Local anything/apps/mobile/.env is untouched; local scripts/dev-backend.sh is NOT started."
echo ""

echo "🚀 Starting Metro (expo start -c) against production ..."
cd "$MOBILE_DIR"
exec env \
  EXPO_PUBLIC_BASE_URL="$PROD_URL" \
  EXPO_PUBLIC_PROXY_BASE_URL="$PROD_URL" \
  EXPO_PUBLIC_API_URL="$PROD_URL" \
  EXPO_PUBLIC_HOST="$PROD_HOST" \
  npx expo start -c
