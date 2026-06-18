import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/nutrition-plans/[id] — owner edits or soft-deletes their plan (Wave 7 ticket 2.75). RLS
// owner_all scopes the row; a non-owner touches ZERO → 404.
//
// DB is porsager's tagged-template `sql`.
const FORMS = ["dry", "wet", "raw", "mixed"];

async function PATCH(request, { params }) {
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
    const { food_brand, food_product, food_form, daily_portion, target_calories, notes, active } = body;
    if (food_form != null && !FORMS.includes(food_form)) {
      return Response.json({ error: "Invalid food_form" }, { status: 400 });
    }
    const updated = await sql`
      UPDATE nutrition_plans SET
        food_brand = COALESCE(${food_brand ?? null}, food_brand),
        food_product = COALESCE(${food_product ?? null}, food_product),
        food_form = COALESCE(${food_form ?? null}, food_form),
        daily_portion = COALESCE(${daily_portion ?? null}, daily_portion),
        target_calories = COALESCE(${target_calories ?? null}, target_calories),
        notes = COALESCE(${notes ?? null}, notes),
        active = COALESCE(${active ?? null}, active),
        updated_at = now()
      WHERE id = ${params.id} AND owner_user_id = ${userId} AND deleted_at IS NULL
      RETURNING *
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Plan not found or not authorized" }, { status: 404 });
    }
    return Response.json({ plan: updated[0] });
  } catch (e) {
    console.error("[PATCH /api/nutrition-plans/[id]] Error:", e?.message);
    return Response.json({ error: "Failed to update plan" }, { status: 500 });
  }
}

async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const deleted = await sql`
      UPDATE nutrition_plans SET deleted_at = now(), updated_at = now()
      WHERE id = ${params.id} AND owner_user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `;
    if (deleted.length === 0) {
      return Response.json({ error: "Plan not found or not authorized" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/nutrition-plans/[id]] Error:", e?.message);
    return Response.json({ error: "Failed to delete plan" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedPATCH as PATCH, wrappedDELETE as DELETE };
