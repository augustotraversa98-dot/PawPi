import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { isLapsed } from "./logic";
import { upcomingMilestone } from "../weekly-digest/logic";

// GET / POST /api/pets/[id]/reengagement — the comeback loop (unit E12).
//
// GET returns the pet's lapse status (no ring activity for N owner-tz days; ?n override, default 7) plus
// the "Welcome back — here's what your pack did" payload: friends' REAL recent moments (public activity
// only), an upcoming milestone, pack-streak status, and the current streak with repair availability. All
// real — a clean empty state when there's nothing, never fabricated.
//
// POST actions: opt_out (stop win-backs), repair (one-tap streak repair with a returning-user grace
// window, E2 extended), seen (mark returned / clear lapsed_since). reengagement_state (0101) + the
// streak helpers degrade cleanly pre-migration (42P01/42883 → feature absent, never 500).

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_FUNCTION = "42883";
const isMissingSchema = (e) => e?.code === UNDEFINED_TABLE || e?.code === UNDEFINED_FUNCTION;
const isMissingTable = (e) => e?.code === UNDEFINED_TABLE;
const GRACE_DAYS = 14; // returning-user streak-repair grace window
const isIntId = (v) => /^\d+$/.test(String(v));
const toDayStr = (v) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10);

async function requireOwnedPet(session, petIdRaw) {
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 };
  if (!isIntId(petIdRaw)) return { error: "Pet not found", status: 404 };
  const ownerUserId = await resolveUserId(session.user.id);
  if (ownerUserId === null) return { error: "User profile not found", status: 404 };
  const petId = parseInt(petIdRaw, 10);
  const owned = await sql`SELECT 1 FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId} LIMIT 1`;
  if (owned.length === 0) return { error: "Pet not found", status: 404 };
  return { ownerUserId, petId };
}

async function GET(request, { params }) {
  try {
    const session = await auth();
    const gate = await requireOwnedPet(session, params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { ownerUserId, petId } = gate;

    const { searchParams } = new URL(request.url);
    const n = Math.max(parseInt(searchParams.get("n") || "", 10) || 7, 1);

    const [prof] = await sql`
      SELECT COALESCE(timezone, 'America/Buenos_Aires') AS tz,
             (now() AT TIME ZONE COALESCE(timezone, 'America/Buenos_Aires'))::date AS today
      FROM user_profiles WHERE id = ${ownerUserId}
    `;
    const tz = prof.tz;
    const today = toDayStr(prof.today);

    const [petRow] = await sql`SELECT name, birthday, adoption_date FROM pets WHERE id = ${petId}`;

    // Last REAL activity day (walk / daily moment / care(food) log), owner-tz.
    const [act] = await sql`
      SELECT GREATEST(
        (SELECT max((start_time AT TIME ZONE ${tz})::date) FROM health_walk_logs
          WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}),
        (SELECT max(post_date) FROM posts WHERE pet_id = ${petId} AND is_daily_update = true),
        (SELECT max((logged_at AT TIME ZONE ${tz})::date) FROM health_food_logs
          WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId})
      ) AS last_active_day
    `;
    const lastActiveDay = toDayStr(act?.last_active_day);
    const lapsed = isLapsed(lastActiveDay, today, n);

    // Friends' real recent moments (accepted friends, daily moment in the last 7 days).
    const friendRows = await sql`
      SELECT DISTINCT ON (fp.id) fp.id, fp.name, fp.avatar_url, p.image_url, p.post_date
      FROM pet_friendships f
      JOIN pets fp ON fp.id = CASE
        WHEN f.requester_pet_id = ${petId} THEN f.receiver_pet_id ELSE f.requester_pet_id END
      JOIN posts p ON p.pet_id = fp.id AND p.is_daily_update = true AND p.post_date > ${today}::date - 7
      WHERE f.status = 'accepted' AND (f.requester_pet_id = ${petId} OR f.receiver_pet_id = ${petId})
      ORDER BY fp.id, p.post_date DESC
      LIMIT 8
    `;
    const friends = friendRows.map((r) => ({
      pet_id: r.id, name: r.name, avatar_url: r.avatar_url,
      image_url: r.image_url, post_date: toDayStr(r.post_date),
    }));

    const milestone = upcomingMilestone({
      birthday: toDayStr(petRow?.birthday),
      adoptionDate: toDayStr(petRow?.adoption_date),
      today,
      windowDays: 14,
    });

    // Streak + repair availability (grace window), degrade cleanly.
    let streak = null;
    let repairAvailable = false;
    try {
      await withSavepoint(async () => {
        const [st] = await sql`
          SELECT current_count, longest_count, pre_reset_count, reset_at
          FROM pet_streaks WHERE pet_id = ${petId}
        `;
        if (st) {
          streak = { current: st.current_count, longest: st.longest_count };
          repairAvailable =
            st.reset_at != null && st.pre_reset_count != null &&
            Date.now() - new Date(st.reset_at).getTime() < GRACE_DAYS * 86400000;
        }
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
    }

    // Pack-streak status (E7), degrade cleanly.
    let packActive = 0;
    try {
      await withSavepoint(async () => {
        const rows = await sql`SELECT status FROM app_pack_streaks_for_pet(${petId}, ${ownerUserId})`;
        packActive = rows.filter((r) => r.status === "active").length;
      });
    } catch (e) {
      if (!isMissingSchema(e)) throw e;
    }

    // Lapse bookkeeping (opt-out + lapsed_since), degrade cleanly.
    let optedOut = false;
    let lapsedSince = null;
    try {
      await withSavepoint(async () => {
        const [s] = await sql`
          SELECT opted_out, lapsed_since FROM reengagement_state WHERE pet_id = ${petId}
        `;
        if (s) { optedOut = !!s.opted_out; lapsedSince = toDayStr(s.lapsed_since); }
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
    }

    return Response.json({
      lapsed,
      lapsed_since: lapsedSince,
      last_active_day: lastActiveDay,
      opted_out: optedOut,
      welcome_back: {
        friends,
        milestone,
        pack_active: packActive,
        streak,
        repair_available: repairAvailable,
      },
    });
  } catch (error) {
    console.error("[GET /api/pets/[id]/reengagement] ERROR:", error.message);
    return Response.json({ error: "Failed to load reengagement" }, { status: 500 });
  }
}

async function POST(request, { params }) {
  try {
    const session = await auth();
    const gate = await requireOwnedPet(session, params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { ownerUserId, petId } = gate;

    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === "opt_out" || action === "opt_in") {
      const optedOut = action === "opt_out";
      try {
        await withSavepoint(async () => {
          await sql`
            INSERT INTO reengagement_state (pet_id, owner_user_id, opted_out, updated_at)
            VALUES (${petId}, ${ownerUserId}, ${optedOut}, now())
            ON CONFLICT (pet_id) DO UPDATE SET opted_out = ${optedOut}, updated_at = now()
          `;
        });
      } catch (e) {
        if (!isMissingTable(e)) throw e;
        return Response.json({ error: "Not available yet", degraded: true }, { status: 503 });
      }
      return Response.json({ opted_out: optedOut });
    }

    if (action === "seen") {
      // Mark the pet returned — clear the lapse marker.
      try {
        await withSavepoint(async () => {
          await sql`
            INSERT INTO reengagement_state (pet_id, owner_user_id, lapsed_since, updated_at)
            VALUES (${petId}, ${ownerUserId}, NULL, now())
            ON CONFLICT (pet_id) DO UPDATE SET lapsed_since = NULL, updated_at = now()
          `;
        });
      } catch (e) {
        if (!isMissingTable(e)) throw e;
      }
      return Response.json({ ok: true });
    }

    if (action === "repair") {
      // One-tap returning-user streak repair (E2 with a grace window). Free.
      let streak = null;
      try {
        await withSavepoint(async () => {
          const [row] = await sql`
            SELECT current_count, longest_count, pre_reset_count, reset_at
            FROM app_winback_repair_streak(${petId}, ${ownerUserId}, ${GRACE_DAYS})
          `;
          if (row) {
            streak = {
              current: row.current_count,
              longest: row.longest_count,
              repair_available:
                row.reset_at != null && row.pre_reset_count != null &&
                Date.now() - new Date(row.reset_at).getTime() < GRACE_DAYS * 86400000,
            };
          }
        });
      } catch (e) {
        if (!isMissingSchema(e)) throw e;
        return Response.json({ error: "Streak repair isn't available yet", degraded: true }, { status: 503 });
      }
      return Response.json({ streak });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/pets/[id]/reengagement] ERROR:", error.message);
    return Response.json({ error: "Failed to update reengagement" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
