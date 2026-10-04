import { auth } from "@/auth";

// POST /api/client-diagnostics — a tiny, authenticated "the app saw something it should never see"
// beacon. The mobile app calls it fire-and-forget; the ONLY effect is ONE structured line in the
// Railway deploy logs (searchable: `[client-diagnostics]`). It touches no database, so it can never
// 500 a request on a DB error and needs no migration/RLS.
//
// Why it exists (Oct 2026): an owner who had finished onboarding was thrown back into the wizard
// after tapping Services and created duplicate dogs. The server logs could not say HOW the app got
// there (no screen history, no way to tell a restart from a navigation). The client now reports the
// breadcrumb the moment the wizard guard fires.
//
// Hardened on purpose: authenticated callers only; the event name is a closed allow-list; every
// field is type-checked, truncated and capped (nothing from the body is logged verbatim); and a small
// per-user, per-instance cap keeps a misbehaving client from flooding the logs. Never put PII in
// here — ids and screen paths only.

const EVENTS = new Set(["onboarding_wizard_for_existing_owner"]);
const WHERES = new Set(["mount", "submit"]);
const MAX_TRAIL = 15;

// Per-instance, per-user cap (diagnostics are not security-critical; this only bounds log volume).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map(); // authUserId -> number[] (timestamps)

function allowed(key, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    // bound memory: drop entries with no recent hits
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return true;
}

const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : undefined);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined);

function sanitizeTrail(trail) {
  if (!Array.isArray(trail)) return undefined;
  return trail.slice(-MAX_TRAIL).map((e) => ({ p: str(e?.p, 80), ago_s: num(e?.ago_s) }));
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !EVENTS.has(body.event)) {
    return Response.json({ error: "Unknown event" }, { status: 400 });
  }

  const userKey = String(session.user.id);
  if (!allowed(userKey)) {
    return Response.json({ error: "Too many reports" }, { status: 429 });
  }

  const record = {
    event: body.event,
    auth_user_id: userKey,
    where: WHERES.has(body.where) ? body.where : undefined,
    screen: str(body.screen, 40),
    session_age_s: num(body.session_age_s),
    trail: sanitizeTrail(body.trail),
    platform: str(body.platform, 16),
    os_version: str(String(body.os_version ?? ""), 24) || undefined,
    app_version: str(body.app_version, 24),
    build: str(String(body.build ?? ""), 24) || undefined,
  };

  console.warn(`[client-diagnostics] ${JSON.stringify(record)}`);
  return Response.json({ ok: true });
}

// Test-only: clear the per-user cap between cases.
export const __resetClientDiagnosticsForTests = () => hits.clear();
