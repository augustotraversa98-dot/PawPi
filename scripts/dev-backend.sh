#!/usr/bin/env bash
# One-command backend launcher for physical-device testing.
# - Prints the Mac's LAN IP (the value the mobile .env must point at).
# - Frees port 4000 if something is already bound to it.
# - Starts the web backend, which binds 0.0.0.0:4000 (see apps/web/vite.config.ts).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$REPO_ROOT/anything/apps/web"
PORT=4000

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [ -z "$LAN_IP" ]; then
  echo "⚠️  Could not detect a LAN IP (are you on Wi-Fi?). Find it in System Settings → Wi-Fi → Details."
else
  echo "📡 Mac LAN IP: $LAN_IP"
  echo "   Set these in anything/apps/mobile/.env (then restart Metro with cache clear):"
  echo "     EXPO_PUBLIC_BASE_URL=http://$LAN_IP:$PORT"
  echo "     EXPO_PUBLIC_PROXY_BASE_URL=http://$LAN_IP:$PORT"
  echo "     EXPO_PUBLIC_HOST=$LAN_IP:$PORT"
fi

# Free the port if a previous run is still holding it.
if lsof -ti "tcp:$PORT" >/dev/null 2>&1; then
  echo "🧹 Clearing port $PORT..."
  lsof -ti "tcp:$PORT" | xargs kill -9 2>/dev/null || true
fi

echo "🚀 Starting backend on http://0.0.0.0:$PORT ..."
cd "$WEB_DIR"
exec bun run dev
