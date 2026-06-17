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
  # Auto-sync the mobile .env to this IP so you never hand-edit it.
  "$REPO_ROOT/scripts/sync-mobile-ip.sh" || true

  # Keep AUTH_URL UNSET in the web backend. Auth.js here uses trustHost + the
  # request's host header (see apps/web/__create/index.ts), so login redirects
  # follow whatever host you browse (localhost or the LAN IP) and survive Wi-Fi/
  # IP changes. A fixed AUTH_URL rewrites every request origin to itself, so after
  # an IP change the post-login redirect points at a stale host → "site can't be
  # reached". So comment out any active AUTH_URL line if one sneaks back in.
  WEB_ENV="$WEB_DIR/.env"
  if [ -f "$WEB_ENV" ] && grep -qE '^AUTH_URL=' "$WEB_ENV"; then
    TMP_ENV="$(mktemp)"
    awk '/^AUTH_URL=/ { print "# " $0; next } { print }' "$WEB_ENV" > "$TMP_ENV"
    mv "$TMP_ENV" "$WEB_ENV"
    echo "🧹 Commented out active AUTH_URL in web .env (Auth.js uses trustHost + request host)."
  fi
fi

# Free the port if a previous run is still holding it.
if lsof -ti "tcp:$PORT" >/dev/null 2>&1; then
  echo "🧹 Clearing port $PORT..."
  lsof -ti "tcp:$PORT" | xargs kill -9 2>/dev/null || true
fi

echo "🚀 Starting backend on http://0.0.0.0:$PORT ..."
cd "$WEB_DIR"
exec bun run dev
