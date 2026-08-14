import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";

// /api/pets/[id]/leaderboard — weekly care-effort leagues (unit E8, docs/pet-owner-engagement.md).
//
// XP comes from CARE EFFORT (walk / ring close / care action / paw GIVEN), never from likes received,
// so the board rewards effort not popularity. DENSITY-GATED: friends is always available; breed /
// neighborhood only render at/above a min cohort size — otherwise we FALL BACK to the friends board or
// a clean "not enough dogs near you yet" state (never an empty/fake board). Location is coarse + opt-in
// and never exposed. Ranking runs in a DEFINER helper (it must read other owners' logs). DEGRADES
// CLEANLY pre-migration (missing table/fn -> empty-safe board, opt-in -> 503).

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_FUNCTION = "42883";
const UNDEFINED_COLUMN = "42703";
const isMissingSchema = (e) =>
  e?.code === UNDEFINED_TABLE || e?.code === UNDEFINED_FUNCTION || e?.code === UNDEFINED_COLUMN;
const isIntId = (v) => Number.isInteger(v) || /^\d+$/.test(String(v ?? ""));

const FLAVORS = new Set(["friends", "breed", "neighborhood"]);
const DEFAULT_MIN_COHORT = 5; // config: min dogs before a breed/neighborhood board renders
const LEAGUE_SIZE = 30; // cohort cap (~Duolingo league)
const LEAGUE_ORDER = { bronze: 0, silver: 1, gold: 2 };

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

// Tier from finishing position within the cohort: top third gold, middle silver, rest bronze.
function tierFor(rank, size) {
  if (!rank || !size) return "bronze";
  const q = rank / size;
  if (q <= 1 / 3) return "gold";
  if (q <= 2 / 3) return "silver";
  return "bronze";
}

async function fetchBoard(petId, ownerUserId, flavor, weekStart, minCohort) {
  return sql`
    SELECT * FROM app_leaderboard(
      ${petId}, ${ownerUserId}, ${flavor}, ${weekStart}::date, ${minCohort}, ${LEAGUE_SIZE}
    )
  `;
}

async function GET(request, { params }) {
  try {
    const session = await auth();
    const gate = await requireOwnedPet(session, params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { ownerUserId, petId } = gate;

    const { searchParams } = new URL(request.url);
    const requested = FLAVORS.has(searchParams.get("flavor")) ? searchParams.get("flavor") : "friends";
    const minCohort = Math.max(parseInt(searchParams.get("min") || "", 10) || DEFAULT_MIN_COHORT, 1);

    // Owner-timezone current week (Monday start).
    const [wk] = await sql`
      SELECT date_trunc('week', (now() AT TIME ZONE COALESCE(timezone, 'America/Buenos_Aires')))::date AS week_start
      FROM user_profiles WHERE id = ${ownerUserId}
    `;
    const weekStart = wk?.week_start;
    const toDay = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
    const weekStartStr = weekStart ? toDay(weekStart) : null;

    let flavor = requested;
    let gated = false;
    let board = [];
    let me = null;
    let movement = "same";

    try {
      await withSavepoint(async () => {
        board = await fetchBoard(petId, ownerUserId, requested, weekStartStr, minCohort);

        // Density gate: a sparse breed/neighborhood board falls back to friends (never empty/fake).
        if (board.length === 0 && requested !== "friends") {
          gated = true;
          flavor = "friends";
          board = await fetchBoard(petId, ownerUserId, "friends", weekStartStr, 1);
        }

        const meRow = board.find((r) => r.is_me);
        if (meRow) {
          const tier = tierFor(meRow.rank, board.length);
          me = { xp: meRow.xp, rank: meRow.rank, tier };

          // Promotion/relegation: compare to the most recent PRIOR-week snapshot for this flavor.
          const [prev] = await sql`
            SELECT tier FROM pet_leaderboard_weeks
            WHERE pet_id = ${petId} AND flavor = ${flavor} AND week_start < ${weekStartStr}::date
            ORDER BY week_start DESC LIMIT 1
          `;
          if (prev?.tier != null && LEAGUE_ORDER[tier] != null && LEAGUE_ORDER[prev.tier] != null) {
            movement =
              LEAGUE_ORDER[tier] > LEAGUE_ORDER[prev.tier]
                ? "promoted"
                : LEAGUE_ORDER[tier] < LEAGUE_ORDER[prev.tier]
                  ? "relegated"
                  : "same";
          }

          // Persist this week's snapshot (own-row RLS).
          await sql`
            INSERT INTO pet_leaderboard_weeks (pet_id, owner_user_id, flavor, week_start, xp, rank, tier, updated_at)
            VALUES (${petId}, ${ownerUserId}, ${flavor}, ${weekStartStr}::date, ${meRow.xp}, ${meRow.rank}, ${tier}, now())
            ON CONFLICT (pet_id, flavor, week_start) DO UPDATE SET
              xp = EXCLUDED.xp, rank = EXCLUDED.rank, tier = EXCLUDED.tier, updated_at = now()
          `;
        }
      });
    } catch (e) {
      if (!isMissingSchema(e)) throw e; // pre-migration -> empty-safe board below
    }

    return Response.json({
      flavor,
      requested_flavor: requested,
      gated,
      week_start: weekStartStr,
      min_cohort: minCohort,
      board: board.map((r) => ({
        pet_id: r.pet_id,
        name: r.pet_name,
        handle: r.pet_handle,
        avatar_url: r.pet_avatar,
        xp: r.xp,
        rank: r.rank,
        is_me: r.is_me,
      })),
      me,
      movement,
    });
  } catch (error) {
    console.error("[GET /api/pets/[id]/leaderboard] ERROR:", error.message);
    return Response.json({ error: "Failed to load leaderboard" }, { status: 500 });
  }
}

async function POST(request, { params }) {
  try {
    const session = await auth();
    const gate = await requireOwnedPet(session, params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { ownerUserId, petId } = gate;

    const body = (await request.json().catch(() => ({}))) ?? {};
    if (body.action !== "set_area") return Response.json({ error: "Unknown action" }, { status: 400 });

    const optIn = body.opt_in !== false;
    // Coarse area label only — we never accept or store a precise home location.
    const area = optIn ? String(body.area ?? "").trim().slice(0, 120) || null : null;
    if (optIn && !area) return Response.json({ error: "A coarse area is required to opt in" }, { status: 400 });

    try {
      await withSavepoint(async () => {
        await sql`
          UPDATE pets SET lb_opt_in = ${optIn}, lb_area = ${area}, updated_at = now()
          WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
        `;
      });
    } catch (e) {
      if (!isMissingSchema(e)) throw e;
      return Response.json({ error: "Neighborhood boards aren't available yet", degraded: true }, { status: 503 });
    }
    return Response.json({ ok: true, opt_in: optIn, area });
  } catch (error) {
    console.error("[POST /api/pets/[id]/leaderboard] ERROR:", error.message);
    return Response.json({ error: "Failed to update leaderboard settings" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
