import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { rankHousehold } from "./logic";

// GET / POST /api/pets/[id]/household-leaderboard?week=<YYYY-MM-DD>
//
// The private household leaderboard (unit E13 PR3) — per-caregiver contributions this week (moments,
// care actions, walks), ranked positively. Owner OR active caregiver reads it. CELEBRATE the family:
// the pure ranking names a "most active caregiver" but NEVER a least-active one. Per-household opt-out
// (owner-managed). Degrades cleanly pre-migration (42P01/42883 → empty board, never 500).

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_FUNCTION = "42883";
const isMissingSchema = (e) => e?.code === UNDEFINED_TABLE || e?.code === UNDEFINED_FUNCTION;
const isMissingTable = (e) => e?.code === UNDEFINED_TABLE;
const isIntId = (v) => /^\d+$/.test(String(v));
const isDayStr = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));
const toDayStr = (v) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10);

async function requirePetAccess(session, petIdRaw) {
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 };
  if (!isIntId(petIdRaw)) return { error: "Pet not found", status: 404 };
  const callerId = await resolveUserId(session.user.id);
  if (callerId === null) return { error: "User profile not found", status: 404 };
  const petId = parseInt(petIdRaw, 10);
  const owned = await sql`SELECT 1 FROM pets WHERE id = ${petId} AND owner_user_id = ${callerId} LIMIT 1`;
  if (owned.length > 0) return { petId, callerId, isOwner: true };
  let hasAccess = false;
  try {
    await withSavepoint(async () => {
      const [r] = await sql`SELECT app_user_has_pet_access(${petId}) AS ok`;
      hasAccess = !!r?.ok;
    });
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
  }
  if (!hasAccess) return { error: "Pet not found", status: 404 };
  return { petId, callerId, isOwner: false };
}

async function GET(request, { params }) {
  try {
    const session = await auth();
    const gate = await requirePetAccess(session, params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { petId, callerId } = gate;

    const { searchParams } = new URL(request.url);
    const weekParam = searchParams.get("week");
    const [wk] = await sql`
      SELECT date_trunc('week', ${isDayStr(weekParam) ? weekParam : null}::date)::date AS ws_param,
             date_trunc('week', (now() AT TIME ZONE 'America/Buenos_Aires'))::date AS ws_now
    `;
    const weekStart = isDayStr(weekParam) ? toDayStr(wk.ws_param) : toDayStr(wk.ws_now);

    // Opt-out (owner-managed, household-readable).
    let optedOut = false;
    try {
      await withSavepoint(async () => {
        const [p] = await sql`SELECT opted_out FROM household_leaderboard_prefs WHERE pet_id = ${petId}`;
        optedOut = !!p?.opted_out;
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
    }
    if (optedOut) {
      return Response.json({ week_start: weekStart, opted_out: true, members: [], most_active_user_id: null });
    }

    let rows = [];
    try {
      await withSavepoint(async () => {
        rows = await sql`SELECT * FROM app_household_leaderboard(${petId}, ${weekStart}::date)`;
      });
    } catch (e) {
      if (!isMissingSchema(e)) throw e; // pre-migration → empty board
    }

    const members = rows.map((r) => ({
      member_user_id: r.member_user_id,
      username: r.username,
      avatar_url: r.avatar_url,
      is_owner: r.is_owner === true,
      moments: Number(r.moments || 0),
      walks: Number(r.walks || 0),
      care_actions: Number(r.care_actions || 0),
      total: Number(r.total || 0),
    }));
    const ranked = rankHousehold(members);

    return Response.json({
      week_start: weekStart,
      opted_out: false,
      is_me: callerId,
      members: ranked.members,
      most_active_user_id: ranked.most_active_user_id,
    });
  } catch (error) {
    console.error("[GET /api/pets/[id]/household-leaderboard] ERROR:", error.message);
    return Response.json({ error: "Failed to load household leaderboard" }, { status: 500 });
  }
}

async function POST(request, { params }) {
  try {
    const session = await auth();
    const gate = await requirePetAccess(session, params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { petId, callerId, isOwner } = gate;

    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === "opt_out" || action === "opt_in") {
      // Only the OWNER manages the household opt-out.
      if (!isOwner) return Response.json({ error: "Only the owner can change this" }, { status: 403 });
      const optedOut = action === "opt_out";
      try {
        await withSavepoint(async () => {
          await sql`
            INSERT INTO household_leaderboard_prefs (pet_id, owner_user_id, opted_out, updated_at)
            VALUES (${petId}, ${callerId}, ${optedOut}, now())
            ON CONFLICT (pet_id) DO UPDATE SET opted_out = ${optedOut}, updated_at = now()
          `;
        });
      } catch (e) {
        if (!isMissingTable(e)) throw e;
        return Response.json({ error: "Not available yet", degraded: true }, { status: 503 });
      }
      return Response.json({ opted_out: optedOut });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/pets/[id]/household-leaderboard] ERROR:", error.message);
    return Response.json({ error: "Failed to update household leaderboard" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
