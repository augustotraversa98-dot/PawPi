// video — the vendor-agnostic VIDEO seam for telehealth consults (Phase 2 ticket 2.18).
//
// The single function the routes call: getVideoRoom({ session }) → { joinUrl, token, room }.
// Routes NEVER hardcode a vendor — they call this seam. The vendor lives behind env keys
// (video/config). When unconfigured it throws VideoNotConfiguredError so the route returns a
// clean 503 and nothing crashes (the SAME dormant-behind-keys pattern as payments).
//
// A single 'generic' adapter is provided: it derives a deterministic room from the session
// and mints a short HMAC token from the vendor secret. This is a SWAPPABLE placeholder — a
// real Daily/Jitsi/Twilio adapter slots in behind the same getVideoRoom() contract (pick the
// adapter via VIDEO_PROVIDER) without touching the routes.

import crypto from "node:crypto";
import { videoConfig, VideoNotConfiguredError } from "./config";

// The room id for a session — the vendor's stored room_ref if present, else a deterministic
// per-session id so both participants resolve the SAME room.
function roomForSession(session) {
  return session?.room_ref || `pawpi-consult-${session?.id}`;
}

// generic adapter: deterministic room + an HMAC-signed short token (placeholder for a real
// vendor SDK token). Swap this for a vendor adapter behind the same return shape.
function genericRoom(cfg, session) {
  const room = roomForSession(session);
  const token = crypto
    .createHmac("sha256", cfg.apiSecret)
    .update(`${room}:${session?.id ?? ""}`)
    .digest("hex")
    .slice(0, 32);
  return {
    room,
    token,
    joinUrl: `${cfg.baseUrl}/${encodeURIComponent(room)}?t=${token}`,
  };
}

/**
 * getVideoRoom({ session }) → { joinUrl, token, room }.
 * THROWS VideoNotConfiguredError (503-shaped) when the vendor keys are unset — the route maps
 * it to a clean 503. Never logs or returns a secret beyond the join token the client needs.
 */
export async function getVideoRoom({ session }) {
  const cfg = videoConfig();
  if (!cfg) throw new VideoNotConfiguredError();
  // Only the 'generic' adapter exists today; a real vendor would branch on cfg.provider.
  return genericRoom(cfg, session);
}

export { VideoNotConfiguredError } from "./config";
