import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/recall-matches/[id] — the owner dismisses a recall alert (Wave 7 ticket 2.75). RLS
// owner_all scopes the row; a non-owner touches ZERO → 404.
//
// DB is porsager's tagged-template `sql`.
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
    const dismissed = await sql`
      UPDATE pet_food_recall_matches SET dismissed_at = now()
      WHERE id = ${params.id} AND owner_user_id = ${userId} AND dismissed_at IS NULL
      RETURNING id
    `;
    if (dismissed.length === 0) {
      return Response.json({ error: "Alert not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/recall-matches/[id]] Error:", e?.message);
    return Response.json({ error: "Failed to dismiss alert" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
