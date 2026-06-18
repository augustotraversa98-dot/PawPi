import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Real, date-ranged Vet Summary aggregation (ticket 2.50 Part A). Pulls ALL of a pet's
// health data for [from, to], scoped by pet_id + owner_user_id (owner-only — RLS enforces it
// too). Replaces the fake mockSummaryData. This is NOT a diagnosis — it's structured data to
// prepare a vet conversation.
//
// GET /api/vet-record/full-summary?petId=&from=YYYY-MM-DD&to=YYYY-MM-DD

const lower = (s) => (s || "").toString().toLowerCase();
const isLowAppetite = (a) => /low|poor|decreas|reduc|none|skip|refus/.test(lower(a));

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const petId = parseInt(searchParams.get("petId"));
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!Number.isInteger(petId) || !from || !to) {
      return Response.json({ error: "petId, from and to are required" }, { status: 400 });
    }

    const pets = await sql`
      SELECT id, name, breed, species, birthday FROM pets
      WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (pets.length === 0) {
      return Response.json({ error: "Pet not found or not yours" }, { status: 403 });
    }
    const pet = pets[0];
    const f = `${from}T00:00:00Z`;
    const t = `${to}T23:59:59Z`;

    const [
      food, poo, pee, vomit, weight, meds, photos, walks, wellness,
      allergies, conditions, vaccinations, notes,
    ] = await Promise.all([
      sql`SELECT logged_at, amount, appetite, water_intake, notes FROM health_food_logs
          WHERE pet_id = ${petId} AND owner_user_id = ${userId} AND logged_at BETWEEN ${f} AND ${t}
          ORDER BY logged_at DESC`,
      sql`SELECT logged_at, amount, shape, color, blood, mucus, straining FROM health_poo_logs
          WHERE pet_id = ${petId} AND owner_user_id = ${userId} AND logged_at BETWEEN ${f} AND ${t}`,
      sql`SELECT logged_at, frequency, color, difficulty_peeing, pain_or_crying, blood_visible, increased_thirst
          FROM health_pee_logs
          WHERE pet_id = ${petId} AND owner_user_id = ${userId} AND logged_at BETWEEN ${f} AND ${t}`,
      sql`SELECT logged_at, number_of_episodes, appearance, relation_to_food FROM health_vomit_logs
          WHERE pet_id = ${petId} AND owner_user_id = ${userId} AND logged_at BETWEEN ${f} AND ${t}
          ORDER BY logged_at DESC`,
      sql`SELECT logged_at, weight, weight_unit FROM health_weight_logs
          WHERE pet_id = ${petId} AND owner_user_id = ${userId} AND logged_at BETWEEN ${f} AND ${t}
          ORDER BY logged_at ASC`,
      sql`SELECT name, dose, status FROM health_medical_care_logs
          WHERE pet_id = ${petId} AND owner_user_id = ${userId} AND given_at BETWEEN ${f} AND ${t}`,
      sql`SELECT created_at, body_area, image_url FROM health_photo_checks
          WHERE pet_id = ${petId} AND owner_user_id = ${userId} AND created_at BETWEEN ${f} AND ${t}
          ORDER BY created_at DESC`,
      sql`SELECT start_time, duration_minutes, distance FROM health_walk_logs
          WHERE pet_id = ${petId} AND owner_user_id = ${userId} AND start_time BETWEEN ${f} AND ${t}`,
      sql`SELECT logged_at, check_type FROM health_wellness_logs
          WHERE pet_id = ${petId} AND owner_user_id = ${userId} AND logged_at BETWEEN ${f} AND ${t}`,
      sql`SELECT allergen, severity FROM pet_allergies WHERE pet_id = ${petId} AND owner_user_id = ${userId}`,
      sql`SELECT condition, status FROM pet_conditions WHERE pet_id = ${petId} AND owner_user_id = ${userId}`,
      sql`SELECT name, date_given FROM pet_vaccinations WHERE pet_id = ${petId} AND owner_user_id = ${userId} ORDER BY date_given DESC NULLS LAST`,
      sql`SELECT note_date, note, vet_name FROM vet_notes
          WHERE pet_id = ${petId} AND owner_user_id = ${userId} AND note_date BETWEEN ${from} AND ${to}
          ORDER BY note_date DESC`,
    ]);

    // Meds adherence: group by name; count given vs missed/skipped.
    const medMap = {};
    for (const m of meds) {
      const key = m.name || "Medication";
      const e = (medMap[key] ||= { name: key, dose: m.dose || null, given: 0, missed: 0, total: 0 });
      e.total += 1;
      if (/miss|skip/.test(lower(m.status))) e.missed += 1;
      else e.given += 1;
      if (!e.dose && m.dose) e.dose = m.dose;
    }

    const byArea = {};
    for (const p of photos) byArea[p.body_area] = (byArea[p.body_area] || 0) + 1;

    const summary = {
      range: { from, to },
      pet: { id: pet.id, name: pet.name, breed: pet.breed, species: pet.species, birthday: pet.birthday },
      food: {
        count: food.length,
        lowAppetiteCount: food.filter((r) => isLowAppetite(r.appetite)).length,
        recent: food.slice(0, 7),
      },
      poo: {
        count: poo.length,
        abnormalCount: poo.filter((r) => r.blood || r.mucus || r.straining).length,
      },
      pee: {
        count: pee.length,
        concernCount: pee.filter(
          (r) => r.difficulty_peeing || r.pain_or_crying || r.blood_visible || r.increased_thirst,
        ).length,
      },
      vomit: {
        episodes: vomit.reduce((s, r) => s + (r.number_of_episodes || 1), 0),
        events: vomit.slice(0, 10),
      },
      weight: {
        series: weight.map((r) => ({
          date: (r.logged_at instanceof Date ? r.logged_at.toISOString() : String(r.logged_at)).slice(0, 10),
          weight: Number(r.weight),
          unit: r.weight_unit || "lbs",
        })),
      },
      meds: Object.values(medMap),
      photoChecks: { count: photos.length, byArea, items: photos.slice(0, 24) },
      walks: {
        count: walks.length,
        totalMinutes: walks.reduce((s, r) => s + (r.duration_minutes || 0), 0),
        totalDistance: walks.reduce((s, r) => s + (Number(r.distance) || 0), 0),
      },
      wellness: { count: wellness.length },
      allergies,
      conditions,
      vaccinations,
      vetNotes: notes,
      disclaimer:
        "Social Pet helps you track changes and prepare better conversations with your veterinarian. It does not diagnose or replace professional veterinary care.",
    };

    return Response.json({ summary });
  } catch (error) {
    console.error("[GET /api/vet-record/full-summary] Error:", error.message);
    return Response.json({ error: "Failed to build summary" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
