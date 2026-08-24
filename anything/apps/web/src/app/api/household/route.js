import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";

// GET / POST /api/household — the multi-pet household home (unit E14).
//
// GET lists the user's household dogs (owned + co-cared via pet_caregivers) each with today's ring
// status + streak at a glance, plus the OPTIONAL family streak (a household flame that advances on days
// when EVERY owned dog's ring closed; forgiveness-aware; opt-in). Strict per-pet scoping is preserved —
// each dog's ring/streak is independent. POST toggles the family-streak opt-in.
//
// Everything degrades cleanly pre-migration (42P01/42883 → the field is simply absent, never a 500). A
// single-dog account is unaffected (the family streak stays inert until opt-in, and is meaningless < 2 dogs).

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_FUNCTION = "42883";
const isMissingSchema = (e) => e?.code === UNDEFINED_TABLE || e?.code === UNDEFINED_FUNCTION;
const isMissingTable = (e) => e?.code === UNDEFINED_TABLE;
const toDayStr = (v) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10);

async function requireOwner(session) {
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 };
  const ownerUserId = await resolveUserId(session.user.id);
  if (ownerUserId === null) return { error: "User profile not found", status: 404 };
  return { ownerUserId };
}

async function ringForPet(petId, ownerUserId, tz, day) {
  // Prefer the shared derivation (E13/0102); degrade to the persisted pet_care_days row, then null.
  let ringClosed = null;
  try {
    await withSavepoint(async () => {
      const [d] = await sql`SELECT * FROM app_pet_ring_segments(${petId}, ${tz}, ${day}::date)`;
      if (d) ringClosed = !!(d.walk_done && d.moment_done && d.care_done);
    });
    if (ringClosed !== null) return ringClosed;
  } catch (e) {
    if (e?.code !== UNDEFINED_FUNCTION) throw e;
  }
  try {
    await withSavepoint(async () => {
      const [r] = await sql`SELECT ring_closed FROM pet_care_days WHERE pet_id = ${petId} AND day = ${day}::date`;
      ringClosed = r ? !!r.ring_closed : false;
    });
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
  return ringClosed;
}

// Streaks for a whole household in ONE query instead of one round-trip per pet. Every request
// runs inside a single per-request transaction (withRequestContext), so the per-pet awaits this
// replaced were not actually concurrent at the DB level — they queued up sequentially on the same
// connection, each paying its own SAVEPOINT/RELEASE overhead. Same fix shape as the other
// HighLatencyP95 N+1s (daycare-stays, training-programs, shop-orders): batch via WHERE = ANY(ids).
async function streaksForPets(petIds) {
  const streaksByPetId = new Map();
  if (petIds.length === 0) return streaksByPetId;
  try {
    await withSavepoint(async () => {
      const rows = await sql`
        SELECT pet_id, current_count, longest_count FROM pet_streaks WHERE pet_id = ANY(${petIds})
      `;
      for (const r of rows) {
        streaksByPetId.set(r.pet_id, { current: r.current_count, longest: r.longest_count });
      }
    });
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
  return streaksByPetId;
}

async function GET() {
  try {
    const session = await auth();
    const gate = await requireOwner(session);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { ownerUserId } = gate;

    const [prof] = await sql`
      SELECT COALESCE(timezone, 'America/Buenos_Aires') AS tz,
             (now() AT TIME ZONE COALESCE(timezone, 'America/Buenos_Aires'))::date AS today
      FROM user_profiles WHERE id = ${ownerUserId}
    `;
    const tz = prof.tz;
    const today = toDayStr(prof.today);

    // Owned pets (always) + co-cared pets (via active pet_caregivers grants; degrade if 0049 absent).
    const owned = await sql`
      SELECT id, name, avatar_url FROM pets WHERE owner_user_id = ${ownerUserId} ORDER BY created_at ASC
    `;
    let coCared = [];
    try {
      await withSavepoint(async () => {
        coCared = await sql`
          SELECT p.id, p.name, p.avatar_url
          FROM pets p
          WHERE p.id IN (
            SELECT pet_id FROM pet_caregivers
            WHERE grantee_user_id = ${ownerUserId} AND status = 'active'
              AND (expires_at IS NULL OR expires_at > now())
          )
          ORDER BY p.name ASC
        `;
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
    }

    const streaksByPetId = await streaksForPets([...owned, ...coCared].map((p) => p.id));

    const build = async (rows, isMine) =>
      Promise.all(
        rows.map(async (p) => ({
          id: p.id,
          name: p.name,
          avatar_url: p.avatar_url,
          is_mine: isMine,
          ring_closed: await ringForPet(p.id, ownerUserId, tz, today),
          streak: streaksByPetId.get(p.id) ?? null,
        })),
      );

    const dogs = [...(await build(owned, true)), ...(await build(coCared, false))];

    // Family streak (E14) — per owner, over OWNED pets. Degrade cleanly.
    let familyStreak = null;
    try {
      await withSavepoint(async () => {
        const [fs] = await sql`
          SELECT current_count, longest_count, opted_in, last_closed_day
          FROM household_streaks WHERE owner_user_id = ${ownerUserId}
        `;
        if (fs) {
          familyStreak = {
            current: fs.current_count,
            longest: fs.longest_count,
            opted_in: !!fs.opted_in,
            last_closed_day: toDayStr(fs.last_closed_day),
          };
        } else {
          familyStreak = { current: 0, longest: 0, opted_in: false, last_closed_day: null };
        }
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
    }

    return Response.json({
      today,
      tz,
      owned_count: owned.length,
      dogs,
      family_streak: familyStreak,
    });
  } catch (error) {
    console.error("[GET /api/household] ERROR:", error.message);
    return Response.json({ error: "Failed to load household" }, { status: 500 });
  }
}

async function POST(request) {
  try {
    const session = await auth();
    const gate = await requireOwner(session);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { ownerUserId } = gate;

    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === "family_streak_opt_in" || action === "family_streak_opt_out") {
      const optIn = action === "family_streak_opt_in";
      try {
        await withSavepoint(async () => {
          await sql`
            INSERT INTO household_streaks (owner_user_id, opted_in, updated_at)
            VALUES (${ownerUserId}, ${optIn}, now())
            ON CONFLICT (owner_user_id) DO UPDATE SET opted_in = ${optIn}, updated_at = now()
          `;
        });
      } catch (e) {
        if (!isMissingTable(e)) throw e;
        return Response.json({ error: "Family streak isn't available yet", degraded: true }, { status: 503 });
      }
      return Response.json({ opted_in: optIn });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/household] ERROR:", error.message);
    return Response.json({ error: "Failed to update household" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
