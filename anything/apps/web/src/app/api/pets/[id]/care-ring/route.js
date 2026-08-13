import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";

// /api/pets/[id]/care-ring — the daily "Care Ring" (unit E1, docs/pet-owner-engagement.md).
//
// The ring is a VISUALIZATION over logs that already exist — it derives, it does not duplicate.
// Three segments for the owner-timezone day:
//   • Walk   = >=1 walk logged today            (health_walk_logs.start_time)
//   • Moment = today's daily moment/post posted (posts.is_daily_update + post_date)
//   • Care   = >=1 care action today            (food / medical-care / wellness / photo-check log)
// ring_closed = all three. The derived state is written into pet_care_days (E0); the source logs are
// never copied. Rest/vacation mode: a per-day rest_day flag (POST set_rest) + a pause range
// (pet_streaks.paused_until, POST set_pause) — a rest/paused day NEVER breaks the ring or the streak.
//
// OWNER-TZ DAY: resolved server-side as COALESCE(user_profiles.timezone,'America/Buenos_Aires'); the
// current day is (now() AT TIME ZONE tz)::date, and every source is matched with
// (ts AT TIME ZONE tz)::date = day. A ?day=YYYY-MM-DD override keeps it deterministically testable.
//
// DEGRADE CLEANLY: pet_care_days / pet_streaks (migration 0094) are hand-applied to Supabase AFTER
// this deploys. The derivation reads only pre-existing tables, so the ring still reflects real logs
// pre-migration; only the persistence + rest/pause read are wrapped in a SAVEPOINT and treat a missing
// table (42P01) as "not persisted / no rest / not paused" — never a 500.

const UNDEFINED_TABLE = "42P01";
const isMissingTable = (e) => e?.code === UNDEFINED_TABLE;
const isIntId = (v) => /^\d+$/.test(String(v));
const isDayStr = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));
const toDayStr = (v) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10);

// Resolve caller + verify pet ownership. Returns { ownerUserId, tz, today } or { error, status }.
async function requireOwnedPet(session, petIdRaw) {
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 };
  if (!isIntId(petIdRaw)) return { error: "Pet not found", status: 404 };
  const ownerUserId = await resolveUserId(session.user.id);
  if (ownerUserId === null) return { error: "User profile not found", status: 404 };

  const petId = parseInt(petIdRaw, 10);
  const owned = await sql`
    SELECT 1 FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId} LIMIT 1
  `;
  if (owned.length === 0) return { error: "Pet not found", status: 404 };

  const [prof] = await sql`
    SELECT COALESCE(timezone, 'America/Buenos_Aires') AS tz,
           (now() AT TIME ZONE COALESCE(timezone, 'America/Buenos_Aires'))::date AS today
    FROM user_profiles WHERE id = ${ownerUserId}
  `;
  return { ownerUserId, petId, tz: prof.tz, today: toDayStr(prof.today) };
}

// Derive the three segment booleans for (pet, owner, day, tz) straight from the source logs.
async function deriveSegments(petId, ownerUserId, tz, day) {
  const [d] = await sql`
    SELECT
      EXISTS (
        SELECT 1 FROM health_walk_logs w
        WHERE w.pet_id = ${petId} AND w.owner_user_id = ${ownerUserId}
          AND (w.start_time AT TIME ZONE ${tz})::date = ${day}::date
      ) AS walk_done,
      EXISTS (
        SELECT 1 FROM posts p
        WHERE p.pet_id = ${petId} AND p.is_daily_update = true
          AND p.post_date = ${day}::date
      ) AS moment_done,
      (
        EXISTS (SELECT 1 FROM health_food_logs f
          WHERE f.pet_id = ${petId} AND f.owner_user_id = ${ownerUserId}
            AND (f.logged_at AT TIME ZONE ${tz})::date = ${day}::date)
        OR EXISTS (SELECT 1 FROM health_medical_care_logs m
          WHERE m.pet_id = ${petId} AND m.owner_user_id = ${ownerUserId}
            AND (m.given_at AT TIME ZONE ${tz})::date = ${day}::date)
        OR EXISTS (SELECT 1 FROM health_wellness_logs wl
          WHERE wl.pet_id = ${petId} AND wl.owner_user_id = ${ownerUserId}
            AND (wl.logged_at AT TIME ZONE ${tz})::date = ${day}::date)
        OR EXISTS (SELECT 1 FROM health_photo_checks pc
          WHERE pc.pet_id = ${petId} AND pc.owner_user_id = ${ownerUserId}
            AND (pc.created_at AT TIME ZONE ${tz})::date = ${day}::date)
      ) AS care_done
  `;
  const walkDone = !!d.walk_done;
  const momentDone = !!d.moment_done;
  const careDone = !!d.care_done;
  return { walkDone, momentDone, careDone, ringClosed: walkDone && momentDone && careDone };
}

async function GET(request, { params }) {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);
    const gate = await requireOwnedPet(session, params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });

    const { ownerUserId, petId, tz, today } = gate;
    const dayParam = searchParams.get("day");
    const day = isDayStr(dayParam) ? dayParam : today;

    const seg = await deriveSegments(petId, ownerUserId, tz, day);

    // Persist the derived state + read rest/pause. Wrapped in a SAVEPOINT so a pre-migration
    // missing table degrades to "derived only" instead of poisoning the request transaction.
    let restDay = false;
    let pausedUntil = null;
    let persisted = false;
    try {
      await withSavepoint(async () => {
        await sql`
          INSERT INTO pet_care_days
            (pet_id, owner_user_id, day, walk_done, moment_done, care_done, ring_closed, updated_at)
          VALUES
            (${petId}, ${ownerUserId}, ${day}::date, ${seg.walkDone}, ${seg.momentDone},
             ${seg.careDone}, ${seg.ringClosed}, now())
          ON CONFLICT (pet_id, day) DO UPDATE SET
            walk_done = EXCLUDED.walk_done,
            moment_done = EXCLUDED.moment_done,
            care_done = EXCLUDED.care_done,
            ring_closed = EXCLUDED.ring_closed,
            updated_at = now()
        `;
        const [row] = await sql`
          SELECT rest_day FROM pet_care_days WHERE pet_id = ${petId} AND day = ${day}::date
        `;
        restDay = !!row?.rest_day;
        const [st] = await sql`SELECT paused_until FROM pet_streaks WHERE pet_id = ${petId}`;
        pausedUntil = toDayStr(st?.paused_until ?? null);
        persisted = true;
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e; // real error still 500s; a missing table just degrades
    }

    const paused = pausedUntil != null && pausedUntil >= day;
    return Response.json({
      day,
      tz,
      walk_done: seg.walkDone,
      moment_done: seg.momentDone,
      care_done: seg.careDone,
      ring_closed: seg.ringClosed,
      rest_day: restDay,
      paused,
      paused_until: pausedUntil,
      persisted,
    });
  } catch (error) {
    console.error("[GET /api/pets/[id]/care-ring] ERROR:", error.message);
    return Response.json({ error: "Failed to load care ring" }, { status: 500 });
  }
}

async function POST(request, { params }) {
  try {
    const session = await auth();
    const gate = await requireOwnedPet(session, params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { ownerUserId, petId, today } = gate;

    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === "set_rest") {
      const day = isDayStr(body.day) ? body.day : today;
      const restDay = body.rest_day !== false; // default true
      try {
        await withSavepoint(async () => {
          await sql`
            INSERT INTO pet_care_days (pet_id, owner_user_id, day, rest_day, updated_at)
            VALUES (${petId}, ${ownerUserId}, ${day}::date, ${restDay}, now())
            ON CONFLICT (pet_id, day) DO UPDATE SET rest_day = ${restDay}, updated_at = now()
          `;
        });
      } catch (e) {
        if (!isMissingTable(e)) throw e;
        return Response.json(
          { error: "Rest days aren't available yet", degraded: true },
          { status: 503 },
        );
      }
      return Response.json({ day, rest_day: restDay });
    }

    if (action === "set_pause") {
      // paused_until: a YYYY-MM-DD (inclusive) or null to clear the pause.
      const pausedUntil = body.paused_until === null ? null : isDayStr(body.paused_until) ? body.paused_until : null;
      try {
        await withSavepoint(async () => {
          await sql`
            INSERT INTO pet_streaks (pet_id, owner_user_id, paused_until, updated_at)
            VALUES (${petId}, ${ownerUserId}, ${pausedUntil}::date, now())
            ON CONFLICT (pet_id) DO UPDATE SET paused_until = ${pausedUntil}::date, updated_at = now()
          `;
        });
      } catch (e) {
        if (!isMissingTable(e)) throw e;
        return Response.json(
          { error: "Pause isn't available yet", degraded: true },
          { status: 503 },
        );
      }
      return Response.json({ paused_until: pausedUntil });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/pets/[id]/care-ring] ERROR:", error.message);
    return Response.json({ error: "Failed to update care ring" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
