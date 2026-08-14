import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { decideInsight } from "./logic";

// GET /api/pets/[id]/activity-insight — a POSITIVE, behavioral activity insight (unit E9,
// docs/pet-owner-engagement.md).
//
// v1 defaults to the dog's OWN history (this week vs the prior weeks). A breed+age COHORT comparison
// ("more active than X% of {breed}s his age") only renders when the cohort is dense enough AND the pet
// is ABOVE median. Below median we NEVER emit a cohort comparison — the decision below falls through to
// personal progress or a gentle forward nudge, so NO bare-negative insight can ever be returned. This
// is enforced HERE (server-authoritative); the client only maps a `kind` to localized copy.
//
// Behavioral only, never diagnostic (existing PawPi health rule; the surface keeps the disclaimer).
// DEGRADES CLEANLY pre-migration: a missing cohort helper (42883) drops the cohort branch — personal
// history still renders.

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_FUNCTION = "42883";
const isMissingSchema = (e) => e?.code === UNDEFINED_TABLE || e?.code === UNDEFINED_FUNCTION;
const isIntId = (v) => Number.isInteger(v) || /^\d+$/.test(String(v ?? ""));
const DEFAULT_MIN_COHORT = 5;

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
    const minCohort = Math.max(parseInt(searchParams.get("min") || "", 10) || DEFAULT_MIN_COHORT, 2);

    const [prof] = await sql`
      SELECT COALESCE(timezone, 'America/Buenos_Aires') AS tz,
             date_trunc('week', (now() AT TIME ZONE COALESCE(timezone, 'America/Buenos_Aires')))::date AS week_start
      FROM user_profiles WHERE id = ${ownerUserId}
    `;
    const tz = prof.tz;
    const weekStart = prof.week_start instanceof Date
      ? prof.week_start.toISOString().slice(0, 10)
      : String(prof.week_start).slice(0, 10);

    // Own weekly walk counts: this week + the prior three weeks (owner-tz windows).
    const [counts] = await sql`
      WITH b AS (
        SELECT
          (${weekStart}::timestamp) AT TIME ZONE ${tz}                    AS w0s,
          ((${weekStart}::date + 7)::timestamp) AT TIME ZONE ${tz}        AS w0e,
          ((${weekStart}::date - 7)::timestamp) AT TIME ZONE ${tz}        AS w1s,
          ((${weekStart}::date - 14)::timestamp) AT TIME ZONE ${tz}       AS w2s,
          ((${weekStart}::date - 21)::timestamp) AT TIME ZONE ${tz}       AS w3s
      )
      SELECT
        count(*) FILTER (WHERE start_time >= b.w0s AND start_time < b.w0e) AS this_week,
        count(*) FILTER (WHERE start_time >= b.w1s AND start_time < b.w0s) AS last_week,
        count(*) FILTER (WHERE start_time >= b.w2s AND start_time < b.w1s) AS week2,
        count(*) FILTER (WHERE start_time >= b.w3s AND start_time < b.w2s) AS week3
      FROM health_walk_logs, b
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId} AND start_time >= b.w3s
    `;
    const thisWeek = Number(counts?.this_week || 0);
    const lastWeek = Number(counts?.last_week || 0);
    const prior3Max = Math.max(Number(counts?.last_week || 0), Number(counts?.week2 || 0), Number(counts?.week3 || 0));

    // Cohort aggregate (density-gated, DEFINER). Degrades to no-cohort pre-migration.
    let cohort = null;
    try {
      await withSavepoint(async () => {
        const [row] = await sql`
          SELECT * FROM app_activity_cohort(${petId}, ${ownerUserId}, ${weekStart}::date, ${minCohort})
        `;
        if (row && Number(row.cohort_size) >= minCohort) {
          cohort = {
            qualifies: true,
            size: Number(row.cohort_size),
            above_median: row.above_median === true,
            percentile: Number(row.percentile || 0),
            breed: row.breed_label,
          };
        } else if (row) {
          cohort = { qualifies: false, size: Number(row.cohort_size || 0) };
        }
      });
    } catch (e) {
      if (!isMissingSchema(e)) throw e; // pre-migration → personal history only
    }

    const insight = decideInsight({ thisWeek, lastWeek, prior3Max, cohort });

    return Response.json({
      ...insight,
      this_week_walks: thisWeek,
      last_week_walks: lastWeek,
      cohort_gated: !(cohort && cohort.qualifies),
      disclaimer: true, // behavioral, not diagnostic
    });
  } catch (error) {
    console.error("[GET /api/pets/[id]/activity-insight] ERROR:", error.message);
    return Response.json({ error: "Failed to load activity insight" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
