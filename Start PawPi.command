#!/usr/bin/env bash
# Double-clickable launcher (Finder). Runs scripts/dev.sh, then closes this window.
cd "$(dirname "$0")"
./scripts/dev.sh
# Give the spawned windows a moment, then close this launcher window.
sleep 1
osascript -e 'tell application "Terminal" to close (every window whose name contains "Start PawPi.command")' >/dev/null 2>&1 || true
