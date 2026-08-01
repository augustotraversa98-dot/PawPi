// video — the vendor-agnostic VIDEO seam for telehealth consults (Phase 2 ticket 2.18).
//
// The single function the routes call: getVideoRoom({ session }) → { joinUrl, token, room }.
// Routes NEVER hardcode a vendor — they call this seam. The vendor lives behind env keys
// (video/config). When unconfigured it throws VideoNotConfiguredError so the route returns a
// clean 503 and nothing crashes (the SAME dormant-behind-keys pattern as payments).
//
// Two adapters: 'generic' (the original placeholder — deterministic room + HMAC token, kept
// as the default/test fallback) and 'daily' (the real vendor — Daily.co's REST API, embedded
// via an in-app WebView per Option A, no native SDK).

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

// ── Daily.co adapter ──────────────────────────────────────────────────────────────────────

const DAILY_API_BASE = "https://api.daily.co/v1";
const DAILY_DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // 2h from now, when the session has no end time
const DAILY_ROOM_GRACE_MS = 15 * 60 * 1000; // grace window past a known scheduled end time

// Unix-seconds expiration for the room/token: the session's scheduled end time (whichever of
// these fields a caller happens to populate) + a grace window, else a flat default TTL from
// `nowMs` (defaults to Date.now(), overridable so callers can anchor the SAME window at a
// past instant — see isTelehealthSessionExpired below). `telehealth_sessions` carries no
// explicit end-time column today, so this falls back to the default in practice — the field
// checks are forward-compatible, not dead code.
export function dailyExpirySeconds(session, { nowMs = Date.now() } = {}) {
  const scheduledEnd =
    session?.scheduled_end_at || session?.ends_at || session?.end_time || null;
  const scheduledEndMs = scheduledEnd ? new Date(scheduledEnd).getTime() : NaN;
  const expMs = Number.isFinite(scheduledEndMs)
    ? Math.max(scheduledEndMs, nowMs) + DAILY_ROOM_GRACE_MS
    : nowMs + DAILY_DEFAULT_TTL_MS;
  return Math.floor(expMs / 1000);
}

// Safety net for a consult nobody ever explicitly ended (PATCH action='end'): a session's
// Daily room exp is computed at ROOM-CREATION time — which happens on first join, i.e.
// session.started_at — using dailyExpirySeconds' own window. Anchoring that SAME window at
// started_at (instead of "now") mirrors exactly what dailyRoom() computed when the room was
// created, rather than reimplementing the TTL/grace numbers separately. A session with no
// started_at can't be 'in_progress' yet, so it's never considered expired.
export function isTelehealthSessionExpired(session, { nowMs = Date.now() } = {}) {
  const startedAtMs = session?.started_at ? new Date(session.started_at).getTime() : NaN;
  if (!Number.isFinite(startedAtMs)) return false;
  const ceilingMs = dailyExpirySeconds(session, { nowMs: startedAtMs }) * 1000;
  return nowMs > ceilingMs;
}

async function dailyFetch(cfg, path, { method = "GET", body } = {}) {
  const res = await fetch(`${DAILY_API_BASE}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Daily ${method} ${path} failed (${res.status}): ${detail}`);
  }
  return res.json();
}

// Reasonable feature defaults for a vet consult: chat (typed questions) and screen-share (a
// vet sharing a lab result or document) both on. `privacy: "private"` means only a request
// carrying a valid meeting token can join — the room URL alone isn't enough.
function dailyRoomProperties(exp) {
  return { exp, enable_chat: true, enable_screenshare: true };
}

async function dailyRoom(cfg, session, { participantName, persistRoomRef } = {}) {
  const exp = dailyExpirySeconds(session);

  // Reuse: if the session already points at a room, look it up rather than creating a
  // duplicate. A stale/expired room_ref (Daily 404s it) falls through to creating a new one.
  let roomName = session?.room_ref || null;
  let existing = roomName ? await dailyFetch(cfg, `rooms/${encodeURIComponent(roomName)}`) : null;

  if (!existing) {
    const created = await dailyFetch(cfg, "rooms", {
      method: "POST",
      body: { privacy: "private", properties: dailyRoomProperties(exp) },
    });
    roomName = created.name;
    existing = created;
    if (persistRoomRef) await persistRoomRef(roomName);
  }

  const tokenRes = await dailyFetch(cfg, "meeting-tokens", {
    method: "POST",
    body: {
      properties: {
        room_name: roomName,
        ...(participantName ? { user_name: participantName } : {}),
        exp,
      },
    },
  });

  return {
    room: roomName,
    token: tokenRes.token,
    joinUrl: `${existing.url}?t=${encodeURIComponent(tokenRes.token)}`,
  };
}

/**
 * getVideoRoom({ session, participantName, persistRoomRef }) → { joinUrl, token, room }.
 * THROWS VideoNotConfiguredError (503-shaped) when the vendor keys are unset — the route maps
 * it to a clean 503. Never logs or returns a secret beyond the join token the client needs.
 *
 * `participantName` and `persistRoomRef` are 'daily'-only: the 'generic' adapter ignores them.
 * `persistRoomRef(roomName)` is how the caller (the join route, which has DB access — this
 * seam deliberately doesn't) saves a newly-created Daily room name onto `room_ref` so a
 * second join by either participant lands in the same room.
 */
export async function getVideoRoom({ session, participantName, persistRoomRef } = {}) {
  const cfg = videoConfig();
  if (!cfg) throw new VideoNotConfiguredError();
  if (cfg.provider === "daily") {
    return dailyRoom(cfg, session, { participantName, persistRoomRef });
  }
  return genericRoom(cfg, session);
}

export { VideoNotConfiguredError } from "./config";
