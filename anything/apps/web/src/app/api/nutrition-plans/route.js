import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/nutrition-plans — the owner's per-pet nutrition plan (Wave 7 ticket 2.75). Owner-scoped health
// data (RLS owner_all). Non-diagnostic: PawPi records what the owner enters to track + prepare vet
// conversations; it does NOT prescribe a diet.
//   GET  ?petId= — the pet's active (non-deleted) plans.
//   POST          — create a plan for an owned pet.
//
// DB is porsager's tagged-template `sql`.
const FORMS = ["dry", "wet", "raw", "mixed"];

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
    const petId = searchParams.get("petId");
    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }
    const plans = await sql`
      SELECT * FROM nutrition_plans
      WHERE owner_user_id = ${userId} AND pet_id = ${petId} AND deleted_at IS NULL
      ORDER BY active DESC, created_at DESC
    `;
    return Response.json({ plans });
  } catch (e) {
    console.error("[GET /api/nutrition-plans] Error:", e?.message);
    return Response.json({ error: "Failed to load nutrition plans" }, { status: 500 });
  }
}

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const body = (await request.json()) ?? {};
    const { pet_id, food_brand, food_product, food_form, daily_portion, target_calories, notes } = body;
    if (!pet_id) {
      return Response.json({ error: "pet_id is required" }, { status: 400 });
    }
    if (food_form != null && !FORMS.includes(food_form)) {
      return Response.json({ error: "Invalid food_form" }, { status: 400 });
    }
    if (
      target_calories != null &&
      !(Number.isInteger(target_calories) && target_calories >= 0)
    ) {
      return Response.json(
        { error: "target_calories must be a non-negative integer" },
        { status: 400 },
      );
    }
    // The pet must be the caller's.
    const pet = await sql`
      SELECT id FROM pets WHERE id = ${pet_id} AND owner_user_id = ${userId}
    `;
    if (pet.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }
    // RLS owner_all backstops the insert.
    const created = await sql`
      INSERT INTO nutrition_plans
        (pet_id, owner_user_id, food_brand, food_product, food_form, daily_portion, target_calories, notes)
      VALUES (
        ${pet_id}, ${userId}, ${food_brand ?? null}, ${food_product ?? null}, ${food_form ?? null},
        ${daily_portion ?? null}, ${target_calories ?? null}, ${notes ?? null}
      )
      RETURNING *
    `;
    return Response.json({ plan: created[0] }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/nutrition-plans] Error:", e?.message);
    return Response.json({ error: "Failed to create nutrition plan" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
