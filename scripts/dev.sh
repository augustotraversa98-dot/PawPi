#!/usr/bin/env bash
# One command to (re)start everything for physical-device testing.
# - Stops any backend on port 4000 and any running Metro.
# - Opens two Terminal windows: one for the backend, one for Metro.
# Both child scripts auto-detect the current Wi-Fi IP and sync the mobile .env,
# so this is also the command to run after every Wi-Fi / network change.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🧹 Stopping any old backend / Metro ..."
lsof -ti tcp:4000 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -f "expo start" 2>/dev/null || true

echo "🚀 Opening backend + Metro windows ..."
osascript <<OSA
tell application "Terminal"
  activate
  do script "cd '$REPO_ROOT' && ./scripts/dev-backend.sh"
  do script "cd '$REPO_ROOT' && ./scripts/dev-mobile.sh"
end tell
OSA

echo "✅ Done. Backend → http://<your-ip>:4000  |  Metro → exp://<your-ip>:8081"
echo "   Open Expo Go on your iPhone and load the Metro URL shown in its window."
