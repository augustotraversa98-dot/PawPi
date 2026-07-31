#!/usr/bin/env bash
# Double-clickable launcher (Finder). Opens a new Terminal window running Metro
# pointed at the live Railway backend (scripts/dev-mobile-prod.sh) — no local
# backend is started — then closes this launcher window.
cd "$(dirname "$0")"
REPO_ROOT="$(pwd)"

osascript <<OSA
tell application "Terminal"
  activate
  do script "cd '$REPO_ROOT' && ./scripts/dev-mobile-prod.sh"
end tell
OSA

# Give the spawned window a moment, then close this launcher window.
sleep 1
osascript -e 'tell application "Terminal" to close (every window whose name contains "Start PawPi (Production Backend).command")' >/dev/null 2>&1 || true
