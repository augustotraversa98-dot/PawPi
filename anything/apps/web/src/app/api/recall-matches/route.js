import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/recall-matches — active (non-dismissed) food-recall alerts for the owner's pets (Wave 7
// ticket 2.75). RLS (pet_food_recall_matches owner_all + food_recalls any-authed read) scopes the
// rows. Non-diagnostic alert copy lives in the app ("check with your vet").
//
// DB is porsager's tagged-template `sql`.
async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const matches = await sql`
      SELECT
        m.id, m.pet_id, m.recall_id, m.notified_at,
        p.name AS pet_name,
        r.source, r.brand, r.product, r.reason, r.recall_date, r.url
      FROM pet_food_recall_matches m
      JOIN food_recalls r ON r.id = m.recall_id
      LEFT JOIN pets p ON p.id = m.pet_id
      WHERE m.owner_user_id = ${userId} AND m.dismissed_at IS NULL
      ORDER BY m.notified_at DESC
    `;
    return Response.json({ matches });
  } catch (e) {
    console.error("[GET /api/recall-matches] Error:", e?.message);
    return Response.json({ error: "Failed to load recall alerts" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
