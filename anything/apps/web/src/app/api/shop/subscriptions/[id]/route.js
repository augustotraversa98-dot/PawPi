import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/shop/subscriptions/[id] — the OWNER pauses/resumes/CANCELS an auto-reorder plan.
// Phase 2 ticket 2.11. REUSES the 2.3 subscriptions table; subscriptions RLS (0029) scopes
// to the owner (owner FOR ALL) — a non-owner mutates ZERO rows.
//
// PATCH { status } — 'active' | 'paused' | 'cancelled'. Cancelling stops future charges
// (the recurring scheduler skips non-active plans). No hard delete (the row is the history).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json()) ?? {};
    const { status } = body;
    const ALLOWED = ["active", "paused", "cancelled"];
    if (!ALLOWED.includes(status)) {
      return Response.json(
        { error: `status must be one of ${ALLOWED.join(", ")}` },
        { status: 400 },
      );
    }

    // owner_user_id = me scopes the update to my own plan (RLS also enforces it).
    const updated = await sql`
      UPDATE subscriptions
      SET status = ${status}, updated_at = now()
      WHERE id = ${subId} AND owner_user_id = ${userId}
      RETURNING *
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Subscription not found" }, { status: 404 });
    }

    return Response.json({ subscription: updated[0] });
  } catch (error) {
    console.error("[PATCH /api/shop/subscriptions/[id]] Error:", error?.message);
    return Response.json(
      { error: "Failed to update subscription" },
      { status: 500 },
    );
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
