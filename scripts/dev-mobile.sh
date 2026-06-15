#!/usr/bin/env bash
# One-command mobile launcher for physical-device testing.
# - Syncs anything/apps/mobile/.env to your current Mac LAN IP.
# - Starts Metro with a cleared cache (required because EXPO_PUBLIC_* are
#   inlined at build time, so a stale cache would keep the old IP).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$REPO_ROOT/anything/apps/mobile"

# Keep the .env IP current before Metro reads it.
"$REPO_ROOT/scripts/sync-mobile-ip.sh"

echo "🚀 Starting Metro (expo start -c) ..."
cd "$MOBILE_DIR"
exec npx expo start -c
