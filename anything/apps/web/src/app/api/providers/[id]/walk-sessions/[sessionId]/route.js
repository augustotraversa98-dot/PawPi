import sql from "@/app/api/utils/sql";
import { jsonbWriteValue } from "@/app/api/utils/jsonb";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { assertCareAccess, CareAccessError } from "@/app/api/utils/careAccess";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/providers/[id]/walk-sessions/[sessionId] — the WALKER updates THEIR assigned
// session during/after the walk. Phase 2 ticket 2.7 (docs/phase2-tickets/2.7-walking-gps.md).
//
// Two actions (?action= in the body):
//   * 'track'  — append GPS points to the live route (THROTTLED writes from the walker
//                app; the owner reads the growing route live by polling). distance_m may
//                accompany the points.
//   * 'finish' — end the walk: stamp ended_at, set status='finished', record the report
//                fields (distance_m / duration_s / potty / notes / photo_urls), AND write
//                the WALK REPORT into the pet's HEALTH TIMELINE via the EXISTING
//                health-log path (a health_walk_logs row + the 'walk' timeline event,
//                the same path the owner's PostWalkFeedback uses). NO parallel timeline
//                write — a provider-led walk lands identically to a self-logged one.
//
// THREE gates, in order (none bypassed):
//   1. requireProviderCapability(providerId, 'walker') — the MODULE gate (2.1).
//   2. assertCareAccess(petId, providerId, 'health_logs_write', …) — the PET-DATA gate.
//      petId is read from the session row (only the session's pet is touched).
//   3. RLS on walk_sessions (0033): the UPDATE only matches the row where staff_user_id =
//      the caller AND they are active staff — so a non-assigned walker updates ZERO and
//      the live location never leaks. The finish's health_walk_logs write lands in OWNER
//      context (owner_user_id = pets.owner_user_id), exactly like the grooming route.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a
// tagged template; params bind via `${}`. The route jsonb append uses sql.json
// (jsonbWriteValue), the project's sanctioned jsonb write boundary.
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const sessionId = params.sessionId;

    const staffUserId = await resolveUserId(session.user.id);
    if (staffUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // GATE 1 — the provider must HOLD the 'walker' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "walker");

    const body = (await request.json()) ?? {};
    const { action } = body;
    if (action !== "track" && action !== "finish") {
      return Response.json(
        { error: "action must be 'track' or 'finish'" },
        { status: 400 },
      );
    }

    // Load the session — it must belong to this provider. (RLS also scopes the later
    // UPDATE to the assigned walker; this read confirms existence + derives the pet.)
    const sessionRows = await sql`
      SELECT id, pet_id, owner_user_id, status, route, started_at
      FROM walk_sessions
      WHERE id = ${sessionId} AND provider_id = ${providerId}
    `;
    if (sessionRows.length === 0) {
      return Response.json(
        { error: "Walk session not found" },
        { status: 404 },
      );
    }
    const walkSession = sessionRows[0];
    const petId = walkSession.pet_id;

    // GATE 2 — the pet-data gate (mirrors grooming). 403 on denial; audits on success.
    await assertCareAccess(petId, providerId, "health_logs_write", {
      staffUserId,
      action: "write",
      resource: `walk_sessions:${sessionId}`,
    });

    // ── action='track' — append GPS points to the live route ─────────────────────────
    if (action === "track") {
      const { points, distance_m } = body;
      // Accept only well-formed {lat,lng,t} points (no fake/garbage data).
      const clean = Array.isArray(points)
        ? points
            .filter(
              (p) =>
                p &&
                typeof p.lat === "number" &&
                typeof p.lng === "number",
            )
            .map((p) => ({ lat: p.lat, lng: p.lng, t: p.t ?? null }))
        : [];
      if (clean.length === 0) {
        return Response.json(
          { error: "track needs at least one {lat,lng} point" },
          { status: 400 },
        );
      }
      const existing = Array.isArray(walkSession.route) ? walkSession.route : [];
      const merged = existing.concat(clean);

      // RLS scopes the UPDATE to the assigned walker; an unassigned caller updates ZERO
      // (returns no row → 403). distance_m updated when provided.
      const updated = await sql`
        UPDATE walk_sessions
        SET route = ${sql.json(jsonbWriteValue(merged))},
            distance_m = COALESCE(${distance_m ?? null}, distance_m),
            updated_at = NOW()
        WHERE id = ${sessionId}
        RETURNING id, route, distance_m, status
      `;
      if (updated.length === 0) {
        return Response.json(
          { error: "Not authorized to update this walk session" },
          { status: 403 },
        );
      }
      return Response.json({ session: updated[0] });
    }

    // ── action='finish' — end the walk + write the report into the health timeline ────
    const {
      distance_m,
      duration_s,
      potty_pee,
      potty_poo,
      notes,
      photo_urls,
    } = body;

    const photoUrls = Array.isArray(photo_urls)
      ? photo_urls.filter((u) => typeof u === "string" && u.length > 0)
      : [];

    // Finish the session: stamp ended_at + the report fields. RLS scopes to the assigned
    // walker (non-assigned → zero rows → 403).
    const finished = await sql`
      UPDATE walk_sessions
      SET status = 'finished',
          ended_at = NOW(),
          distance_m = COALESCE(${distance_m ?? null}, distance_m),
          duration_s = COALESCE(${duration_s ?? null}, duration_s),
          potty_pee = ${potty_pee === true},
          potty_poo = ${potty_poo === true},
          notes = COALESCE(${notes ?? null}, notes),
          photo_urls = ${photoUrls},
          updated_at = NOW()
      WHERE id = ${sessionId} AND status <> 'finished'
      RETURNING *
    `;
    if (finished.length === 0) {
      return Response.json(
        { error: "Not authorized to finish this walk session, or already finished" },
        { status: 403 },
      );
    }
    const finishedSession = finished[0];

    // Write the WALK REPORT into the pet's HEALTH TIMELINE via the EXISTING health-log
    // path — a health_walk_logs row in OWNER context (owner_user_id = pets.owner_user_id),
    // exactly the table /api/health/walk-logs writes and /api/health/timeline surfaces as
    // a 'walk' event. distance is stored in MILES on health_walk_logs (the app's unit), so
    // metres → miles; duration in minutes. potty maps to the pottyEvents jsonb the existing
    // path uses. This is the SAME shape PostWalkFeedback POSTs — no parallel write.
    let healthLog = null;
    try {
      const ownerUserId = finishedSession.owner_user_id;
      const durationMinutes =
        finishedSession.duration_s != null
          ? Math.round(finishedSession.duration_s / 60)
          : null;
      const distanceMiles =
        finishedSession.distance_m != null
          ? Math.round((finishedSession.distance_m / 1609.34) * 100) / 100
          : null;
      const pottyEvents = {
        pee: finishedSession.potty_pee ? 1 : 0,
        poo: finishedSession.potty_poo ? 1 : 0,
      };

      const healthRows = await sql`
        INSERT INTO health_walk_logs (
          pet_id,
          owner_user_id,
          start_time,
          duration_minutes,
          distance,
          distance_unit,
          potty_events,
          notes,
          source
        ) VALUES (
          ${petId},
          ${ownerUserId},
          ${finishedSession.started_at || sql`NOW()`},
          ${durationMinutes},
          ${distanceMiles},
          'miles',
          ${sql.json(jsonbWriteValue(pottyEvents))},
          ${finishedSession.notes ?? null},
          'walker'
        )
        RETURNING *
      `;
      healthLog = healthRows[0];

      // The 'walk' timeline event (mirrors /api/health/walk-logs). Best-effort — a
      // timeline failure must not fail the finish (the health log is the source of truth).
      try {
        const summary =
          durationMinutes != null
            ? `Walk · ${durationMinutes} min`
            : "Walk completed";
        await sql`
          INSERT INTO health_timeline_events (
            pet_id, owner_user_id, event_type, related_record_id, title, summary, event_time
          ) VALUES (
            ${petId}, ${ownerUserId}, 'walk', ${healthLog.id}, 'Walk completed',
            ${summary}, ${healthLog.start_time}
          )
        `;
      } catch (timelineError) {
        console.error(
          "[walk-sessions finish] Timeline creation failed:",
          timelineError?.message,
        );
      }
    } catch (healthError) {
      // The session is finished regardless; surface that the report write failed so the
      // caller can retry, but do NOT roll back the finish.
      console.error(
        "[walk-sessions finish] Health-log write failed:",
        healthError?.message,
      );
    }

    return Response.json({ session: finishedSession, healthLog });
  } catch (e) {
    if (e instanceof ProviderAuthError || e instanceof CareAccessError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/walk-sessions/[sessionId]] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to update walk session" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
