import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { decideDigestState, upcomingMilestone } from "./logic";

// GET /api/pets/[id]/weekly-digest?day=<YYYY-MM-DD>
//
// "Rex's Week" (unit E11, docs/pet-owner-engagement.md) — REAL weekly stats for the owner-tz week
// (Monday..Sunday) that contains `day` (default today). Owner-scoped; every number derives from the
// pet's OWN logs and PUBLIC friend activity — NEVER fabricated. A quiet/empty week degrades to an
// honest gentle state (state = 'quiet'|'empty'), never fake numbers or a shame frame.
//
// Reads: walks (health_walk_logs), moments (posts.is_daily_update), care actions (food/medical-care/
// wellness/photo logs), ring days closed (pet_care_days), current streak (pet_streaks), the best
// moment of the week (most-pawed daily post), a friends strip (accepted-friend pets that posted a
// daily moment this week — public activity only), and an upcoming milestone (birthday / gotcha within
// ~7 days). The E0/E2 tables (pet_care_days / pet_streaks, 0094/0095) are wrapped in a SAVEPOINT so a
// pre-migration missing table degrades to "no ring days / no streak" instead of a 500.

const UNDEFINED_TABLE = "42P01";
const isMissingTable = (e) => e?.code === UNDEFINED_TABLE;
const isIntId = (v) => /^\d+$/.test(String(v));
const isDayStr = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));
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
    const [prof] = await sql`
      SELECT COALESCE(timezone, 'America/Buenos_Aires') AS tz,
             (now() AT TIME ZONE COALESCE(timezone, 'America/Buenos_Aires'))::date AS today
      FROM user_profiles WHERE id = ${ownerUserId}
    `;
    const tz = prof.tz;
    const day = isDayStr(searchParams.get("day")) ? searchParams.get("day") : toDayStr(prof.today);

    // The owner-tz week (Monday..Sunday) that contains `day`. date_trunc('week') → Monday.
    const [wk] = await sql`
      SELECT date_trunc('week', ${day}::date)::date AS week_start,
             (date_trunc('week', ${day}::date)::date + 7) AS week_end
    `;
    const weekStart = toDayStr(wk.week_start);
    const weekEnd = toDayStr(wk.week_end);

    // Walks in the window (owner-tz calendar day).
    const [walkRow] = await sql`
      SELECT count(*)::int AS n FROM health_walk_logs
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
        AND (start_time AT TIME ZONE ${tz})::date >= ${weekStart}::date
        AND (start_time AT TIME ZONE ${tz})::date <  ${weekEnd}::date
    `;
    const walks = walkRow.n;

    // Daily moments posted in the window.
    const [momentRow] = await sql`
      SELECT count(*)::int AS n FROM posts
      WHERE pet_id = ${petId} AND is_daily_update = true
        AND post_date >= ${weekStart}::date AND post_date < ${weekEnd}::date
    `;
    const moments = momentRow.n;

    // Care actions logged in the window (food + medical-care + wellness + photo-check).
    const [careRow] = await sql`
      SELECT (
        (SELECT count(*) FROM health_food_logs f
          WHERE f.pet_id = ${petId} AND f.owner_user_id = ${ownerUserId}
            AND (f.logged_at AT TIME ZONE ${tz})::date >= ${weekStart}::date
            AND (f.logged_at AT TIME ZONE ${tz})::date <  ${weekEnd}::date)
      + (SELECT count(*) FROM health_medical_care_logs m
          WHERE m.pet_id = ${petId} AND m.owner_user_id = ${ownerUserId}
            AND (m.given_at AT TIME ZONE ${tz})::date >= ${weekStart}::date
            AND (m.given_at AT TIME ZONE ${tz})::date <  ${weekEnd}::date)
      + (SELECT count(*) FROM health_wellness_logs wl
          WHERE wl.pet_id = ${petId} AND wl.owner_user_id = ${ownerUserId}
            AND (wl.logged_at AT TIME ZONE ${tz})::date >= ${weekStart}::date
            AND (wl.logged_at AT TIME ZONE ${tz})::date <  ${weekEnd}::date)
      + (SELECT count(*) FROM health_photo_checks pc
          WHERE pc.pet_id = ${petId} AND pc.owner_user_id = ${ownerUserId}
            AND (pc.created_at AT TIME ZONE ${tz})::date >= ${weekStart}::date
            AND (pc.created_at AT TIME ZONE ${tz})::date <  ${weekEnd}::date)
      )::int AS n
    `;
    const careActions = careRow.n;

    // Best moment of the week — the most-pawed daily post in the window.
    const [best] = await sql`
      SELECT p.id, p.image_url, p.caption, p.post_date,
             (SELECT count(*)::int FROM post_paws pp WHERE pp.post_id = p.id) AS paws
      FROM posts p
      WHERE p.pet_id = ${petId} AND p.is_daily_update = true
        AND p.post_date >= ${weekStart}::date AND p.post_date < ${weekEnd}::date
      ORDER BY paws DESC, p.post_date DESC, p.id DESC
      LIMIT 1
    `;
    const bestMoment = best
      ? {
          post_id: best.id,
          image_url: best.image_url,
          caption: best.caption,
          post_date: toDayStr(best.post_date),
          paws: best.paws,
        }
      : null;

    // Ring days closed this week (E0) — degrade cleanly pre-migration.
    let ringDays = 0;
    try {
      await withSavepoint(async () => {
        const [r] = await sql`
          SELECT count(*)::int AS n FROM pet_care_days
          WHERE pet_id = ${petId} AND ring_closed = true
            AND day >= ${weekStart}::date AND day < ${weekEnd}::date
        `;
        ringDays = r.n;
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
    }

    // Current streak (E0/E2) — degrade cleanly pre-migration.
    let streak = null;
    try {
      await withSavepoint(async () => {
        const [st] = await sql`
          SELECT current_count, longest_count FROM pet_streaks WHERE pet_id = ${petId}
        `;
        if (st) streak = { current: st.current_count, longest: st.longest_count };
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
    }

    // Friends strip — accepted-friend pets that posted a daily moment this week (public activity only).
    const friendRows = await sql`
      SELECT DISTINCT fp.id, fp.name, fp.avatar_url
      FROM pet_friendships f
      JOIN pets fp ON fp.id = CASE
        WHEN f.requester_pet_id = ${petId} THEN f.receiver_pet_id ELSE f.requester_pet_id END
      WHERE f.status = 'accepted'
        AND (f.requester_pet_id = ${petId} OR f.receiver_pet_id = ${petId})
        AND EXISTS (
          SELECT 1 FROM posts p
          WHERE p.pet_id = fp.id AND p.is_daily_update = true
            AND p.post_date >= ${weekStart}::date AND p.post_date < ${weekEnd}::date
        )
      LIMIT 6
    `;
    const friends = friendRows.map((r) => ({ pet_id: r.id, name: r.name, avatar_url: r.avatar_url }));

    // Upcoming milestone (birthday / gotcha within ~7 days of today).
    const [petRow] = await sql`
      SELECT name, handle, avatar_url, birthday, adoption_date FROM pets WHERE id = ${petId}
    `;
    const milestone = upcomingMilestone({
      birthday: toDayStr(petRow?.birthday),
      adoptionDate: toDayStr(petRow?.adoption_date),
      today: day,
      windowDays: 7,
    });

    const state = decideDigestState({
      walks,
      ringDays,
      careActions,
      moments,
      hasStreak: !!(streak && streak.current > 0),
    });

    return Response.json({
      day,
      week_start: weekStart,
      week_end: weekEnd,
      tz,
      state,
      pet: petRow
        ? { id: petId, name: petRow.name, handle: petRow.handle, avatar_url: petRow.avatar_url }
        : { id: petId },
      walks,
      ring_days_closed: ringDays,
      ring_days_total: 7,
      care_actions: careActions,
      moments,
      streak,
      best_moment: bestMoment,
      friends,
      milestone,
    });
  } catch (error) {
    console.error("[GET /api/pets/[id]/weekly-digest] ERROR:", error.message);
    return Response.json({ error: "Failed to load weekly digest" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
