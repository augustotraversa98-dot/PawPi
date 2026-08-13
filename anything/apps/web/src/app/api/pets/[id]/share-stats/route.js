import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";

// GET /api/pets/[id]/share-stats?day=<YYYY-MM-DD>
//
// REAL stats for the share-card deck (unit E4, docs/pet-owner-engagement.md). Owner-scoped; every
// number is derived from the pet's own logs — NEVER fabricated. A card with a 0/absent stat degrades
// to a clean empty state on the client (no fake counts). The streak reads pet_streaks (E0/E2) and
// degrades cleanly pre-migration (missing table → null) so the deck still renders.
//
// Returns: { pet:{id,name,handle,avatar_url}, streak:{current,longest}|null, walks_this_week,
//            moments_total, day }.

const UNDEFINED_TABLE = "42P01";
const isMissingTable = (e) => e?.code === UNDEFINED_TABLE;
const isIntId = (v) => /^\d+$/.test(String(v));
const isDayStr = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));
const toDayStr = (v) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10);

async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isIntId(params.id)) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }
    const ownerUserId = await resolveUserId(session.user.id);
    if (ownerUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const petId = parseInt(params.id, 10);

    const petRows = await sql`
      SELECT id, name, handle, avatar_url FROM pets
      WHERE id = ${petId} AND owner_user_id = ${ownerUserId} LIMIT 1
    `;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }
    const pet = petRows[0];

    const { searchParams } = new URL(request.url);
    const dayParam = searchParams.get("day");
    const [prof] = await sql`
      SELECT COALESCE(timezone, 'America/Buenos_Aires') AS tz,
             (now() AT TIME ZONE COALESCE(timezone, 'America/Buenos_Aires'))::date AS today
      FROM user_profiles WHERE id = ${ownerUserId}
    `;
    const tz = prof.tz;
    const day = isDayStr(dayParam) ? dayParam : toDayStr(prof.today);

    // Walks in the last 7 owner-tz days (inclusive of `day`).
    const [walkRow] = await sql`
      SELECT count(*)::int AS n FROM health_walk_logs
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
        AND (start_time AT TIME ZONE ${tz})::date > ${day}::date - 7
        AND (start_time AT TIME ZONE ${tz})::date <= ${day}::date
    `;
    const [momentRow] = await sql`
      SELECT count(*)::int AS n FROM posts
      WHERE pet_id = ${petId} AND is_daily_update = true
    `;

    // Streak (E0/E2) — degrade cleanly if the table isn't applied yet.
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

    return Response.json({
      day,
      pet: { id: pet.id, name: pet.name, handle: pet.handle, avatar_url: pet.avatar_url },
      streak,
      walks_this_week: walkRow.n,
      moments_total: momentRow.n,
    });
  } catch (error) {
    console.error("[GET /api/pets/[id]/share-stats] ERROR:", error.message);
    return Response.json({ error: "Failed to load share stats" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
