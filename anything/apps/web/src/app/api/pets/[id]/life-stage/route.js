import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { detectLifeStage, effectiveLifeStage, ringGoalsForStage, LIFE_STAGES } from "./logic";

// GET / POST /api/pets/[id]/life-stage
//
// The dog's life stage (unit E15) — puppy / adult / senior, derived from age + size (behavioral, never
// diagnostic), with an owner OVERRIDE. GET (owner or caregiver) returns { detected, override, effective,
// goals }; the ring keeps its THREE segments — the client only adapts copy/suggested actions to the
// effective stage. POST (owner only) sets/clears the override. Degrades cleanly: a missing
// life_stage_override column (pre-0106) → override treated as null (auto-detect), never a 500.

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_FUNCTION = "42883";
const UNDEFINED_COLUMN = "42703";
const isMissingSchema = (e) => e?.code === UNDEFINED_TABLE || e?.code === UNDEFINED_FUNCTION;
const isIntId = (v) => /^\d+$/.test(String(v));
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

// Read the pet's life-stage inputs. life_stage_override degrades to null pre-0106 (missing column).
async function readPet(petId, ownerUserId) {
  const [base] = await sql`
    SELECT birthday, age_years, age_months, weight, weight_unit FROM pets WHERE id = ${petId}
  `;
  let override = null;
  try {
    await withSavepoint(async () => {
      const [o] = await sql`SELECT life_stage_override FROM pets WHERE id = ${petId}`;
      override = o?.life_stage_override ?? null;
    });
  } catch (e) {
    if (e?.code !== UNDEFINED_COLUMN) throw e; // pre-0106 → auto-detect only
  }
  return { base, override };
}

async function GET(request, { params }) {
  try {
    const session = await auth();
    const gate = await requirePetAccess(session, params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { petId } = gate;

    const [prof] = await sql`
      SELECT (now() AT TIME ZONE COALESCE(timezone, 'America/Buenos_Aires'))::date AS today
      FROM user_profiles WHERE id = ${gate.callerId}
    `;
    const today = toDayStr(prof?.today);
    const { base, override } = await readPet(petId);

    const detected = detectLifeStage({
      birthday: toDayStr(base?.birthday),
      ageYears: base?.age_years,
      ageMonths: base?.age_months,
      weight: base?.weight,
      weightUnit: base?.weight_unit,
      today,
    });
    const effective = effectiveLifeStage(override, detected);

    return Response.json({
      detected,
      override: override ?? null,
      effective,
      goals: ringGoalsForStage(effective),
    });
  } catch (error) {
    console.error("[GET /api/pets/[id]/life-stage] ERROR:", error.message);
    return Response.json({ error: "Failed to load life stage" }, { status: 500 });
  }
}

async function POST(request, { params }) {
  try {
    const session = await auth();
    const gate = await requirePetAccess(session, params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { petId, isOwner } = gate;

    // The owner sets the override (the spec: "the owner can override the detected stage").
    if (!isOwner) return Response.json({ error: "Only the owner can set this" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const raw = body?.life_stage;
    const value = raw === null || raw === undefined || raw === "" ? null : String(raw);
    if (value !== null && !LIFE_STAGES.includes(value)) {
      return Response.json({ error: "Invalid life stage" }, { status: 400 });
    }

    try {
      await withSavepoint(async () => {
        await sql`UPDATE pets SET life_stage_override = ${value}, updated_at = now() WHERE id = ${petId}`;
      });
    } catch (e) {
      if (e?.code !== UNDEFINED_COLUMN) throw e;
      return Response.json({ error: "Life stage override isn't available yet", degraded: true }, { status: 503 });
    }
    return Response.json({ override: value });
  } catch (error) {
    console.error("[POST /api/pets/[id]/life-stage] ERROR:", error.message);
    return Response.json({ error: "Failed to set life stage" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
