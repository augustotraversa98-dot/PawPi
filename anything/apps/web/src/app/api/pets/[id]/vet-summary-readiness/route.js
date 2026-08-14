import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";

// GET /api/pets/[id]/vet-summary-readiness — the positive "Vet Summary readiness" indicator (unit E10,
// docs/pet-owner-engagement.md).
//
// Counts the pet's REAL records across the categories that make the next Vet Summary richer (weight,
// meds/preventives, photo checks, vet visits). Readiness grows as records fill — it CELEBRATES progress
// and never shames gaps (the copy lives client-side and is always positive). 0 records → an honest
// low/empty state, never a fabricated number. Owner-scoped reads (own pet's logs). Each category is in
// its own savepoint so a missing table degrades that one category to 0 rather than 500ing.

const UNDEFINED_TABLE = "42P01";
const isMissingTable = (e) => e?.code === UNDEFINED_TABLE;
const isIntId = (v) => /^\d+$/.test(String(v));

async function countSafe(fn) {
  try {
    let n = 0;
    await withSavepoint(async () => {
      const [r] = await fn();
      n = Number(r?.n || 0);
    });
    return n;
  } catch (e) {
    if (isMissingTable(e)) return 0;
    throw e;
  }
}

async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!isIntId(params.id)) return Response.json({ error: "Pet not found" }, { status: 404 });
    const ownerUserId = await resolveUserId(session.user.id);
    if (ownerUserId === null) return Response.json({ error: "User profile not found" }, { status: 404 });
    const petId = parseInt(params.id, 10);

    const owned = await sql`SELECT 1 FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId} LIMIT 1`;
    if (owned.length === 0) return Response.json({ error: "Pet not found" }, { status: 404 });

    const [weight, meds, photos, visits] = await Promise.all([
      countSafe(() => sql`SELECT count(*)::int AS n FROM health_weight_logs WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}`),
      countSafe(() => sql`SELECT count(*)::int AS n FROM health_medical_care_logs WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}`),
      countSafe(() => sql`SELECT count(*)::int AS n FROM health_photo_checks WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}`),
      countSafe(() => sql`SELECT count(*)::int AS n FROM vet_appointments WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}`),
    ]);

    const categories = [
      { key: "weight", count: weight, has: weight > 0 },
      { key: "meds", count: meds, has: meds > 0 },
      { key: "photo_checks", count: photos, has: photos > 0 },
      { key: "vet_visits", count: visits, has: visits > 0 },
    ];
    const total = categories.length;
    const filled = categories.filter((c) => c.has).length;
    const percent = total > 0 ? Math.round((filled / total) * 100) : 0;
    // Positive level buckets (never a "bad" state — just how much is built so far).
    const level = filled === 0 ? "start" : filled < total ? "building" : "great";

    return Response.json({
      categories,
      filled,
      total,
      percent,
      level,
      records_total: weight + meds + photos + visits,
    });
  } catch (error) {
    console.error("[GET /api/pets/[id]/vet-summary-readiness] ERROR:", error.message);
    return Response.json({ error: "Failed to load vet summary readiness" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
