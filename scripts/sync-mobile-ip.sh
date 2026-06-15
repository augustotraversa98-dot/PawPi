#!/usr/bin/env bash
# Auto-syncs the mobile .env to your Mac's current LAN IP.
# Rewrites the IP-dependent EXPO_PUBLIC_* lines in anything/apps/mobile/.env
# so you never have to hand-edit them when your Wi-Fi / IP changes.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/anything/apps/mobile/.env"
PORT=4000

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [ -z "$LAN_IP" ]; then
  echo "⚠️  Could not detect a LAN IP (are you on Wi-Fi?). Skipping .env sync." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️  $ENV_FILE not found. Skipping .env sync." >&2
  exit 1
fi

# Desired values keyed by env var name.
URL="http://$LAN_IP:$PORT"
HOST="$LAN_IP:$PORT"

# Rewrite only the four IP-dependent keys, leaving everything else untouched.
TMP="$(mktemp)"
awk -v url="$URL" -v host="$HOST" '
  /^EXPO_PUBLIC_BASE_URL=/        { print "EXPO_PUBLIC_BASE_URL=" url;        next }
  /^EXPO_PUBLIC_PROXY_BASE_URL=/  { print "EXPO_PUBLIC_PROXY_BASE_URL=" url;  next }
  /^EXPO_PUBLIC_API_URL=/         { print "EXPO_PUBLIC_API_URL=" url;         next }
  /^EXPO_PUBLIC_HOST=/            { print "EXPO_PUBLIC_HOST=" host;           next }
  { print }
' "$ENV_FILE" > "$TMP"

if cmp -s "$TMP" "$ENV_FILE"; then
  rm -f "$TMP"
  echo "✅ Mobile .env already points at $URL — no change."
else
  mv "$TMP" "$ENV_FILE"
  echo "✅ Mobile .env updated to $URL"
fi
